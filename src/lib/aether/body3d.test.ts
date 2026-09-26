import assert from "node:assert/strict";
import { test } from "node:test";
import { BodyPoints, bodyAxes, bodyMetrics, leftRightDiffPct, type BodyDepthPoints, type Vec3 } from "./body3d.ts";

/**
 * A standing person in body space: facing +z, up +y, so their LEFT is +x
 * (a viewer in front sees the person's right hand on the viewer's left).
 */
type Pose = Record<string, Vec3>;

function person(o: { valgusL?: number; headFwd?: number; kneeBack?: number } = {}): Pose {
  const knee = (sideX: number, inward: number): Vec3 => [sideX - inward, 0.5, (o.kneeBack ?? 0) * -1];
  return {
    root: [0, 0.95, 0],
    neck: [0, 1.45, 0],
    head: [0, 1.62, 0],
    shoulderL: [0.19, 1.42, 0],
    shoulderR: [-0.19, 1.42, 0],
    elbowL: [0.21, 1.12, 0],
    elbowR: [-0.21, 1.12, 0],
    wristL: [0.22, 0.86, 0],
    wristR: [-0.22, 0.86, 0],
    hipL: [0.09, 0.93, 0],
    hipR: [-0.09, 0.93, 0],
    kneeL: knee(0.09, o.valgusL ?? 0),
    kneeR: knee(-0.09, 0),
    ankleL: [0.09, 0.08, 0],
    ankleR: [-0.09, 0.08, 0],
    earL: [0.07, 1.6, -0.01 + (o.headFwd ?? 0)],
    earR: [-0.07, 1.6, -0.01 + (o.headFwd ?? 0)],
  };
}

const SKELETON: Record<string, string> = {
  root: "root", neck: "neck_1_joint", head: "head_joint",
  shoulderL: "left_arm_joint", shoulderR: "right_arm_joint",
  elbowL: "left_forearm_joint", elbowR: "right_forearm_joint",
  wristL: "left_hand_joint", wristR: "right_hand_joint",
  hipL: "left_upLeg_joint", hipR: "right_upLeg_joint",
  kneeL: "left_leg_joint", kneeR: "right_leg_joint",
  ankleL: "left_foot_joint", ankleR: "right_foot_joint",
};
const MEASURED: Record<string, string> = {
  ...SKELETON,
  shoulderL: "left_shoulder_1_joint", shoulderR: "right_shoulder_1_joint",
  earL: "left_ear_joint", earR: "right_ear_joint",
};

function points(model: Pose, measured: Pose | null, frames = 60, counts = 60): BodyDepthPoints {
  const sk = Object.entries(SKELETON).filter(([k]) => model[k]);
  const me = measured ? Object.entries(MEASURED).filter(([k]) => measured[k]) : [];
  return {
    frames,
    skeletonNames: sk.map(([, n]) => n),
    skeleton: sk.flatMap(([k]) => model[k]!),
    measuredNames: me.map(([, n]) => n),
    measured: me.flatMap(([k]) => measured![k]!),
    measuredCounts: me.map(() => counts),
  };
}

const near = (a: number | null | undefined, b: number, tol: number, what: string) =>
  assert.ok(a != null && Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("axes: up, the person's right, and the way they face", () => {
  const ax = bodyAxes(new BodyPoints(points(person(), null)))!;
  near(ax.up[1], 1, 1e-6, "up");
  near(ax.right[0], -1, 1e-6, "right");
  near(ax.forward[2], 1, 1e-6, "forward");
});

test("lengths prefer LiDAR over the fitted model, and say which", () => {
  const model = person();
  const real = person();
  real.elbowL = [0.21, 1.10, 0]; // a longer real upper arm
  const m = bodyMetrics(new BodyPoints(points(model, real)));
  assert.equal(m.segments.upperArmL!.src, "measured");
  near(m.segments.upperArmL!.mm, Math.hypot(0.02, 0.32) * 1000, 0.01, "upper arm");
  near(m.segments.shoulderWidth!.mm, 380, 0.01, "shoulders");
  near(m.segments.thighL!.mm, 430, 0.01, "thigh");
});

test("a joint read in too few frames falls back to the model", () => {
  const m = bodyMetrics(new BodyPoints(points(person(), person(), 60, 5)));
  assert.equal(m.segments.shinR!.src, "model");
  assert.equal(m.measuredJoints, 0);
});

test("null measurements are ignored", () => {
  const p = points(person(), person());
  const i = p.measuredNames.indexOf("left_forearm_joint");
  p.measured[i * 3] = null;
  const m = bodyMetrics(new BodyPoints(p));
  assert.equal(m.segments.upperArmL!.src, "model");
  assert.equal(m.segments.upperArmR!.src, "measured");
});

test("a knee drifting inward reads as valgus on that leg only", () => {
  const m = bodyMetrics(new BodyPoints(points(person(), person({ valgusL: 0.04 }))));
  assert.ok(m.front!.kneeValgusL! > 4, `left ${m.front!.kneeValgusL}`);
  near(m.front!.kneeValgusR, 0, 1e-6, "right");
  near(m.front!.kneeGapMm, 140, 0.01, "knee gap");
  near(m.front!.ankleGapMm, 180, 0.01, "ankle gap");
});

test("a knee bowing outward reads negative", () => {
  const m = bodyMetrics(new BodyPoints(points(person(), person({ valgusL: -0.03 }))));
  assert.ok(m.front!.kneeValgusL! < -3, `left ${m.front!.kneeValgusL}`);
});

test("a raised left shoulder reads positive", () => {
  const p = person();
  p.shoulderL = [0.19, 1.44, 0];
  const m = bodyMetrics(new BodyPoints(points(person(), p)));
  near(m.front!.shoulderLeftHigherMm, 20, 0.01, "shoulder");
});

test("side-on: forward head moves the ear ahead and lowers the neck–ear angle", () => {
  const upright = bodyMetrics(new BodyPoints(points(person(), person())));
  const forward = bodyMetrics(new BodyPoints(points(person(), person({ headFwd: 0.06 }))));
  near(upright.side!.headAheadMm, -10, 0.01, "upright ear");
  near(forward.side!.headAheadMm, 50, 0.01, "forward ear");
  assert.ok(forward.side!.neckEarDeg! < upright.side!.neckEarDeg!, "angle drops");
});

test("side-on: a locked-back knee reads positive", () => {
  const m = bodyMetrics(new BodyPoints(points(person(), person({ kneeBack: 0.02 }))));
  assert.ok(m.side!.kneeBackDeg! > 2, `knee ${m.side!.kneeBackDeg}`);
});

test("depth error along the line of sight does not move the plane readings", () => {
  // Side-on the camera looks along the left-right axis; push the far side's
  // joints along it, as an occluded joint's depth would.
  const real = person({ headFwd: 0.03 });
  for (const k of ["shoulderR", "hipR", "kneeR", "ankleR", "earR"]) real[k] = [real[k]![0] + 0.12, real[k]![1], real[k]![2]];
  const clean = bodyMetrics(new BodyPoints(points(person(), person({ headFwd: 0.03 }))));
  const noisy = bodyMetrics(new BodyPoints(points(person(), real)));
  near(noisy.side!.headAheadMm, clean.side!.headAheadMm!, 1e-6, "head");
  near(noisy.side!.trunkLeanDeg, clean.side!.trunkLeanDeg!, 1e-6, "trunk");
});

test("left/right difference", () => {
  near(leftRightDiffPct({ mm: 300, src: "measured" }, { mm: 306, src: "measured" }), 1.98, 0.01, "pct");
  assert.equal(leftRightDiffPct(null, { mm: 1, src: "model" }), null);
});
