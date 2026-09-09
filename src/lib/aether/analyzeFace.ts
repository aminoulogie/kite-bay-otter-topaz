import { ANALYZER_VERSION, EDMA_SEGMENTS, FACE, MESH_KEYS, MIDLINE_KEYS, PAIRS, type Region } from "./landmarks.ts";
import { angleDeg, dist, lineAngleVsHorizontal, midpoint, procrustesAlign, procrustesDistance, robustMidlineX, type Pt } from "./geometry.ts";
import type { FramingReport, LightingReport, Quality } from "./captureQuality.ts";

export type Proportions = {
  canthalTiltL: number;
  canthalTiltR: number;
  canthalTiltAsym: number;
  palpebralL: number;
  palpebralR: number;
  intercanthal: number;
  intercanthalOverPalpebral: number;
  midfaceOverLower: number;
  mouthOverIntercanthal: number;
  noseOverMouth: number;
  jawOverBizygomatic: number;
  facialIndex: number;
  convexityDeg: number | null;
};

export type FaceAnalysis = {
  analyzerVersion: string; capturedAt: string; intercanthal: number; midlineX: number;
  yawProxy: number; rollDeg: number; smileProxy: number;
  yawDeg: number; pitchDeg: number; poseSource: "matrix" | "proxy";
  gates: { ok: boolean; reasons: string[] }; confidence: number; alpha: number;
  regional: Record<Region, number>; edma: { name: string; ratio: number }[];
  canthalTiltL: number; canthalTiltR: number;
  faceShape: { label: string; confidence: number }; notes: string[];
  proportions: Proportions;
  lighting?: LightingReport;
  framing?: FramingReport;
  quality?: Quality;
  mesh: Pt[];
};

function lm(list: Pt[], key: keyof typeof FACE) { return list[FACE[key]]; }

export function analyzeFaceLandmarks(
  raw: Pt[],
  extra?: {
    yawDeg?: number;
    pitchDeg?: number;
    rollDeg?: number;
    poseSource?: "matrix" | "proxy";
    lighting?: LightingReport;
    framing?: FramingReport;
    quality?: Quality;
    smileBlend?: number;
  },
): FaceAnalysis {
  const notes: string[] = [];
  const reasons: string[] = [];
  const lInner = lm(raw, "leftInner"); const rInner = lm(raw, "rightInner");
  const lOuter = lm(raw, "leftOuter"); const rOuter = lm(raw, "rightOuter");
  const nose = lm(raw, "noseTip"); const chin = lm(raw, "chin");
  const lMouth = lm(raw, "leftMouth"); const rMouth = lm(raw, "rightMouth");
  const intercanthal = lInner && rInner ? dist(lInner, rInner) : 0.12;
  const eyeMid = lInner && rInner ? midpoint(lInner, rInner) : { x: 0.5, y: 0.4 };
  const rollProxy = lInner && rInner ? lineAngleVsHorizontal(lInner, rInner) : 0;
  const yawProxy = nose ? (nose.x - eyeMid.x) / (intercanthal || 0.12) : 0;
  const smileProxy = extra?.smileBlend ?? (lMouth && rMouth ? dist(lMouth, rMouth) / (intercanthal || 0.12) : 0);
  const rollDeg = extra?.rollDeg ?? rollProxy;
  const yawDeg = extra?.yawDeg ?? yawProxy * 38;
  const pitchDeg = extra?.pitchDeg ?? 0;
  const poseSource = extra?.poseSource ?? "proxy";

  if (Math.abs(rollDeg) > 2.5) reasons.push(`Head roll ${rollDeg.toFixed(1)}° — recapture level.`);
  if (Math.abs(yawDeg) > 10 && Math.abs(yawProxy) > 0.18) reasons.push("Face is turned (yaw). Front metrics need a true front.");
  if (smileProxy > 1.85 || (extra?.smileBlend ?? 0) > 0.7) reasons.push("Smile detected — use a rest face for metrics.");
  if (!lInner || !rInner || !nose || !chin) reasons.push("Landmarks incomplete.");

  const midlinePts = MIDLINE_KEYS.map((k) => lm(raw, k)).filter(Boolean) as Pt[];
  const midlineX = robustMidlineX(midlinePts.length ? midlinePts : [eyeMid]);
  const original: Pt[] = [];
  const reflectedRelabeled: Pt[] = [];
  for (const p of PAIRS) {
    const L = lm(raw, p.L); const R = lm(raw, p.R);
    if (!L || !R) continue;
    original.push(L, R);
    reflectedRelabeled.push({ x: 2 * midlineX - R.x, y: R.y, z: R.z }, { x: 2 * midlineX - L.x, y: L.y, z: L.z });
  }
  for (const p of midlinePts) {
    original.push(p);
    reflectedRelabeled.push({ x: 2 * midlineX - p.x, y: p.y, z: p.z });
  }
  const alignedMirror = procrustesAlign(reflectedRelabeled, original);
  const alpha = original.length ? procrustesDistance(alignedMirror, original) : 0;

  const regional: Record<Region, number> = { orbits: 0, midface: 0, mouth: 0, mandible: 0 };
  const regionalN: Record<Region, number> = { orbits: 0, midface: 0, mouth: 0, mandible: 0 };
  for (const p of PAIRS) {
    const L = lm(raw, p.L); const R = lm(raw, p.R);
    if (!L || !R) continue;
    const dL = Math.abs(L.x - midlineX) / (intercanthal || 1);
    const dR = Math.abs(R.x - midlineX) / (intercanthal || 1);
    const v = Math.abs(L.y - R.y) / (intercanthal || 1);
    regional[p.region] += Math.hypot(dL - dR, v);
    regionalN[p.region] += 1;
  }
  (Object.keys(regional) as Region[]).forEach((k) => { regional[k] = regionalN[k] ? regional[k] / regionalN[k] : 0; });

  const leftSeg = new Map<string, number>();
  const rightSeg = new Map<string, number>();
  for (const s of EDMA_SEGMENTS) {
    const a = lm(raw, s.a); const b = lm(raw, s.b);
    if (!a || !b) continue;
    if (s.side === "L") leftSeg.set(s.name, dist(a, b));
    if (s.side === "R") rightSeg.set(s.name, dist(a, b));
  }
  const edma: { name: string; ratio: number }[] = [];
  for (const name of leftSeg.keys()) {
    const L = leftSeg.get(name); const R = rightSeg.get(name);
    if (!L || !R) continue;
    edma.push({ name, ratio: Math.max(L, R) / Math.min(L, R) });
  }
  edma.sort((a, b) => b.ratio - a.ratio);

  const canthalTiltL = lInner && lOuter ? -lineAngleVsHorizontal(lInner, lOuter) : 0;
  const canthalTiltR = rInner && rOuter ? lineAngleVsHorizontal(rOuter, rInner) : 0;
  const palpebralL = lInner && lOuter ? dist(lInner, lOuter) : 0;
  const palpebralR = rInner && rOuter ? dist(rInner, rOuter) : 0;
  const palpebralMean = (palpebralL + palpebralR) / 2 || intercanthal;
  const nasion = lm(raw, "nasion");
  const sub = lm(raw, "subnasale");
  const midface = nasion && sub ? dist(nasion, sub) : 0;
  const lower = sub && chin ? dist(sub, chin) : 0;
  const mouthW = lMouth && rMouth ? dist(lMouth, rMouth) : 0;
  const lAlar = lm(raw, "leftAlar"); const rAlar = lm(raw, "rightAlar");
  const noseW = lAlar && rAlar ? dist(lAlar, rAlar) : 0;
  const lGon = lm(raw, "leftGonion"); const rGon = lm(raw, "rightGonion");
  const lChk = lm(raw, "leftCheek"); const rChk = lm(raw, "rightCheek");
  const jawW = lGon && rGon ? dist(lGon, rGon) : intercanthal * 3.2;
  const zygoW = lChk && rChk ? dist(lChk, rChk) : jawW;
  const brow = lm(raw, "glabella");
  const faceH = brow && chin ? dist(brow, chin) : intercanthal * 4;
  const faceW = lGon && rGon ? jawW : zygoW;
  const ratio = faceH / (faceW || 1);

  let convexityDeg: number | null = null;
  if (nasion && nose && chin && nasion.z != null && nose.z != null && chin.z != null) {
    convexityDeg = angleDeg(
      { x: nasion.x - nose.x, y: nasion.y - nose.y, z: (nasion.z ?? 0) - (nose.z ?? 0) },
      { x: chin.x - nose.x, y: chin.y - nose.y, z: (chin.z ?? 0) - (nose.z ?? 0) },
    );
  }

  const proportions: Proportions = {
    canthalTiltL,
    canthalTiltR,
    canthalTiltAsym: Math.abs(canthalTiltL - canthalTiltR),
    palpebralL,
    palpebralR,
    intercanthal,
    intercanthalOverPalpebral: intercanthal / (palpebralMean || 1),
    midfaceOverLower: lower ? midface / lower : 0,
    mouthOverIntercanthal: mouthW / (intercanthal || 1),
    noseOverMouth: mouthW ? noseW / mouthW : 0,
    jawOverBizygomatic: zygoW ? jawW / zygoW : 0,
    facialIndex: ratio,
    convexityDeg,
  };

  let label = "oval";
  if (ratio > 1.45) label = "oblong";
  else if (ratio < 1.15) label = "round / square";

  notes.push("Ratios are 2D photo heuristics on this pose — not skeletal cephalometrics.");
  notes.push("MediaPipe has no trichion. Classical facial thirds from the hairline are omitted.");
  notes.push("Alpha is total shape asymmetry under this pose — not fluctuating asymmetry.");
  notes.push("z-mesh is monocular MediaPipe depth, not iPhone TrueDepth / Face ID.");
  if (convexityDeg != null) notes.push(`Soft-tissue convexity at pronasale (3D z) ≈ ${convexityDeg.toFixed(1)}°.`);

  const poseQuality = Math.max(0, 1 - Math.abs(yawDeg) / 45 - Math.abs(rollDeg) / 12 - Math.abs(pitchDeg) / 40);
  const detection = lInner && rInner && nose && chin ? 0.92 : 0.4;
  const mesh = MESH_KEYS.map((k) => {
    const p = lm(raw, k);
    return p ? { x: p.x, y: p.y, z: p.z ?? 0 } : { x: 0.5, y: 0.5, z: 0 };
  });

  if (extra?.quality?.reasons.length) reasons.push(...extra.quality.reasons.filter((r) => !reasons.includes(r)));

  return {
    analyzerVersion: ANALYZER_VERSION,
    capturedAt: new Date().toISOString(),
    intercanthal, midlineX, yawProxy, rollDeg, smileProxy,
    yawDeg, pitchDeg, poseSource,
    gates: { ok: reasons.length === 0, reasons },
    confidence: Math.max(0.05, Math.min(1, detection * Math.max(0.2, poseQuality))),
    alpha, regional, edma, canthalTiltL, canthalTiltR,
    faceShape: { label, confidence: 0.5 },
    notes, proportions,
    lighting: extra?.lighting,
    framing: extra?.framing,
    quality: extra?.quality,
    mesh,
  };
}

export function presentationIndex(a: FaceAnalysis): number {
  const edmaMean = a.edma.reduce((s, e) => s + Math.abs(e.ratio - 1), 0) / Math.max(1, a.edma.length);
  return Math.max(0, Math.min(1, 1 - a.alpha * 8 - edmaMean * 1.4));
}
