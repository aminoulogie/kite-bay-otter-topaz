/**
 * Body measurements from the LiDAR body scan (ios/App/App/BodyDepthPlugin.swift).
 *
 * The scan returns two versions of the skeleton, both in METRES in the body's
 * own space (origin at the hips) and averaged over a steady burst:
 *
 * - `skeleton` — ARKit's fitted 3D skeleton. Complete and repeatable, but a
 *   model: bone lengths may be a template scaled to the body.
 * - `measured` — the joints ARKit finds in the image, placed in 3D by the
 *   LiDAR depth at each one. Real distances, with ~1 cm noise per joint.
 *
 * Lengths prefer `measured`, and never mix the two sources inside one length.
 * The body's axes (up, right, forward) come from the fitted skeleton, which
 * knows left from right even side-on.
 *
 * Why the plane measurements survive occlusion: a joint hidden behind the body
 * gets its depth from whatever surface is in front of it, so its error lies
 * along the camera's line of sight. Facing the phone that line is the body's
 * forward axis, which the frontal-plane measurements drop; side-on it is the
 * left-right axis, which the sagittal-plane measurements drop.
 *
 * What joints cannot give: pelvic tilt and upper-back rounding are properties
 * of the surface (pelvis, spine curve), not of joint centres. They are not
 * reported rather than guessed.
 */

export type Vec3 = [number, number, number];
export type Source = "measured" | "model";

export interface BodyDepthPoints {
  skeletonNames: string[];
  /** Flat xyz, metres. */
  skeleton: number[];
  measuredNames: string[];
  /** Flat xyz, metres; null where the joint was never measured. */
  measured: (number | null)[];
  measuredCounts: number[];
  frames: number;
}

export interface Segment {
  mm: number;
  src: Source;
}

export interface BodyMetrics {
  /** Joint centre to joint centre, so widths are narrower than skin-to-skin. */
  segments: {
    shoulderWidth: Segment | null;
    hipWidth: Segment | null;
    torso: Segment | null;
    upperArmL: Segment | null;
    upperArmR: Segment | null;
    forearmL: Segment | null;
    forearmR: Segment | null;
    thighL: Segment | null;
    thighR: Segment | null;
    shinL: Segment | null;
    shinR: Segment | null;
  };
  /** Facing the phone. */
  front: {
    /** Knee off the hip–ankle line, degrees: + = inward (knock knee), − = outward (bow leg). */
    kneeValgusL: number | null;
    kneeValgusR: number | null;
    /** Knee centre to knee centre, left–right only, mm. */
    kneeGapMm: number | null;
    /** Ankle centre to ankle centre, left–right only, mm. */
    ankleGapMm: number | null;
    /** + = the person's left shoulder sits higher. */
    shoulderLeftHigherMm: number | null;
    hipLeftHigherMm: number | null;
  } | null;
  /** Side-on. */
  side: {
    /**
     * Angle of the neck-base → ear line above horizontal. The scan's neck
     * joint sits in the middle of the neck, forward of the C7 vertebra that
     * the clinical CVA uses, so this reads lower than a clinical CVA — track
     * its change, do not compare it with published norms.
     */
    neckEarDeg: number | null;
    /** Ear ahead of the shoulders, mm. */
    headAheadMm: number | null;
    /** Shoulders ahead of the hips, mm. */
    shoulderAheadMm: number | null;
    /** Trunk (hips → shoulders) forward of vertical, degrees. */
    trunkLeanDeg: number | null;
    /** Knee behind the hip–ankle line, degrees: + = locked back (hyperextended). */
    kneeBackDeg: number | null;
  } | null;
  /** Joints with a usable LiDAR reading. */
  measuredJoints: number;
}

/** Joint names, first match wins. 3D (fitted) and 2D (measured) names differ. */
const NAMES = {
  head: ["head_joint"],
  neck: ["neck_1_joint"],
  root: ["root", "hips_joint"],
  // The 3D skeleton's "shoulder_1" is the collarbone; "arm" is the shoulder joint.
  shoulderL: ["left_arm_joint", "left_shoulder_1_joint"],
  shoulderR: ["right_arm_joint", "right_shoulder_1_joint"],
  elbowL: ["left_forearm_joint"],
  elbowR: ["right_forearm_joint"],
  wristL: ["left_hand_joint"],
  wristR: ["right_hand_joint"],
  hipL: ["left_upLeg_joint"],
  hipR: ["right_upLeg_joint"],
  kneeL: ["left_leg_joint"],
  kneeR: ["right_leg_joint"],
  ankleL: ["left_foot_joint"],
  ankleR: ["right_foot_joint"],
  earL: ["left_ear_joint"],
  earR: ["right_ear_joint"],
} as const;

export type Joint = keyof typeof NAMES;

/** A LiDAR reading needs this share of the burst behind it. */
const MIN_SHARE = 0.3;

export class BodyPoints {
  private skeleton = new Map<string, Vec3>();
  private measured = new Map<string, Vec3>();

  constructor(r: BodyDepthPoints) {
    r.skeletonNames.forEach((name, i) => {
      const p = [r.skeleton[i * 3], r.skeleton[i * 3 + 1], r.skeleton[i * 3 + 2]];
      if (p.every((v) => typeof v === "number" && Number.isFinite(v))) this.skeleton.set(name, p as Vec3);
    });
    const need = Math.max(3, Math.ceil(r.frames * MIN_SHARE));
    r.measuredNames.forEach((name, i) => {
      if ((r.measuredCounts[i] ?? 0) < need) return;
      const p = [r.measured[i * 3], r.measured[i * 3 + 1], r.measured[i * 3 + 2]];
      if (p.every((v) => typeof v === "number" && Number.isFinite(v))) this.measured.set(name, p as Vec3);
    });
  }

  get(joint: Joint, src: Source): Vec3 | null {
    const map = src === "measured" ? this.measured : this.skeleton;
    for (const n of NAMES[joint]) {
      const p = map.get(n);
      if (p) return p;
    }
    return null;
  }

  /** Several joints from ONE source — measured if it has them all. */
  group(joints: Joint[]): { pts: Vec3[]; src: Source } | null {
    for (const src of ["measured", "model"] as const) {
      const pts = joints.map((j) => this.get(j, src));
      if (pts.every((p) => p)) return { pts: pts as Vec3[], src };
    }
    return null;
  }

  get measuredCount(): number {
    return this.measured.size;
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const DEG = 180 / Math.PI;

export interface BodyAxes {
  up: Vec3;
  /** The person's right. */
  right: Vec3;
  /** The way the person faces. */
  forward: Vec3;
}

/**
 * Up = hips → neck; right = left → right shoulder, made square to up.
 * From the fitted skeleton when it has them: it is complete even side-on.
 */
export function bodyAxes(b: BodyPoints): BodyAxes | null {
  const joints: Joint[] = ["root", "neck", "shoulderL", "shoulderR"];
  const model = joints.map((j) => b.get(j, "model"));
  const pts = model.every((p) => p) ? (model as Vec3[]) : b.group(joints)?.pts;
  if (!pts) return null;
  const [root, neck, sl, sr] = pts as [Vec3, Vec3, Vec3, Vec3];
  const up = norm(sub(neck, root));
  const across = sub(sr, sl);
  const right = norm(sub(across, scale(up, dot(across, up))));
  if (!len(up) || !len(right)) return null;
  return { up, right, forward: cross(up, right) };
}

function segment(b: BodyPoints, a: Joint, c: Joint): Segment | null {
  const g = b.group([a, c]);
  return g ? { mm: len(sub(g.pts[0]!, g.pts[1]!)) * 1000, src: g.src } : null;
}

/**
 * How far the middle joint bends off the line joining the outer two, within
 * the plane spanned by `u` (along the limb) and `v`, in degrees, signed + when
 * the middle joint sits on the `toward` side of that line.
 */
function bend(h: Vec3, k: Vec3, a: Vec3, u: Vec3, v: Vec3, toward: number): number {
  const p = (x: Vec3): [number, number] => [dot(x, u), dot(x, v)];
  const [hu, hv] = p(h);
  const [ku, kv] = p(k);
  const [au, av] = p(a);
  const angle = Math.atan2(Math.abs((hu - ku) * (av - kv) - (hv - kv) * (au - ku)), (hu - ku) * (au - ku) + (hv - kv) * (av - kv));
  const deviation = 180 - angle * DEG;
  // Where the hip–ankle line passes at the knee's height, along v.
  const t = au === hu ? 0.5 : (ku - hu) / (au - hu);
  const lineV = hv + t * (av - hv);
  return Math.sign((kv - lineV) * toward) * deviation;
}

export function bodyMetrics(b: BodyPoints): BodyMetrics {
  const segments = {
    shoulderWidth: segment(b, "shoulderL", "shoulderR"),
    hipWidth: segment(b, "hipL", "hipR"),
    torso: segment(b, "neck", "root"),
    upperArmL: segment(b, "shoulderL", "elbowL"),
    upperArmR: segment(b, "shoulderR", "elbowR"),
    forearmL: segment(b, "elbowL", "wristL"),
    forearmR: segment(b, "elbowR", "wristR"),
    thighL: segment(b, "hipL", "kneeL"),
    thighR: segment(b, "hipR", "kneeR"),
    shinL: segment(b, "kneeL", "ankleL"),
    shinR: segment(b, "kneeR", "ankleR"),
  };
  const axes = bodyAxes(b);
  if (!axes) return { segments, front: null, side: null, measuredJoints: b.measuredCount };
  const { up, right, forward } = axes;

  // ---- Frontal plane (up, right) ----
  const legs = b.group(["hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR"]);
  let front: BodyMetrics["front"] = null;
  if (legs) {
    const [hl, kl, al, hr, kr, ar] = legs.pts as Vec3[];
    // Inward, for each leg, is toward the other leg: + right for the left leg.
    front = {
      kneeValgusL: bend(hl!, kl!, al!, up, right, +1),
      kneeValgusR: bend(hr!, kr!, ar!, up, right, -1),
      kneeGapMm: Math.abs(dot(sub(kr!, kl!), right)) * 1000,
      ankleGapMm: Math.abs(dot(sub(ar!, al!), right)) * 1000,
      shoulderLeftHigherMm: null,
      hipLeftHigherMm: dot(sub(hl!, hr!), up) * 1000,
    };
  }
  const sh = b.group(["shoulderL", "shoulderR"]);
  if (sh) {
    front ??= { kneeValgusL: null, kneeValgusR: null, kneeGapMm: null, ankleGapMm: null, shoulderLeftHigherMm: null, hipLeftHigherMm: null };
    front.shoulderLeftHigherMm = dot(sub(sh.pts[0]!, sh.pts[1]!), up) * 1000;
  }

  // ---- Sagittal plane (up, forward): both sides averaged ----
  const pair = (l: Joint, r: Joint): Vec3 | null => {
    const g = b.group([l, r]);
    if (g) return mid(g.pts[0]!, g.pts[1]!);
    for (const src of ["measured", "model"] as const) {
      const p = b.get(l, src) ?? b.get(r, src);
      if (p) return p;
    }
    return null;
  };
  const shoulders = pair("shoulderL", "shoulderR");
  const hips = pair("hipL", "hipR");
  const knees = pair("kneeL", "kneeR");
  const ankles = pair("ankleL", "ankleR");
  const ear = pair("earL", "earR");
  const neck = b.get("neck", "measured") ?? b.get("neck", "model");
  const f = (x: Vec3) => dot(x, forward);
  const u = (x: Vec3) => dot(x, up);
  const side: BodyMetrics["side"] = {
    neckEarDeg: ear && neck ? Math.atan2(u(ear) - u(neck), f(ear) - f(neck)) * DEG : null,
    headAheadMm: ear && shoulders ? (f(ear) - f(shoulders)) * 1000 : null,
    shoulderAheadMm: shoulders && hips ? (f(shoulders) - f(hips)) * 1000 : null,
    trunkLeanDeg: shoulders && hips ? Math.atan2(f(shoulders) - f(hips), u(shoulders) - u(hips)) * DEG : null,
    // Behind = −forward.
    kneeBackDeg: hips && knees && ankles ? bend(hips, knees, ankles, up, forward, -1) : null,
  };
  return { segments, front, side, measuredJoints: b.measuredCount };
}

/** Right minus left over their mean, %: 0 = even. */
export function leftRightDiffPct(l: Segment | null, r: Segment | null): number | null {
  if (!l || !r) return null;
  const m = (l.mm + r.mm) / 2;
  return m ? ((r.mm - l.mm) / m) * 100 : null;
}
