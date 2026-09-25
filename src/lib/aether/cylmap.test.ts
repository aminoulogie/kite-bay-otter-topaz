import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bandWidthMm, cellNoiseMm, compareCyl, cylSymmetry, faceWindow, mergeCyl, summariseCylinder, type Cylinder,
} from "./cylmap.ts";

const W = 201, H = 147, T0 = -100, DT = 1, Y0 = -130, DY = 1.5;

/** A head-like surface round the axis; θ > 0 is the person's left. */
function head(o: { centre?: number; offsetX?: number; leftCheek?: number; noise?: number; seed?: number; chinBack?: number } = {}): Cylinder {
  let seed = o.seed ?? 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const make = () => {
    const z = new Float32Array(W * H).fill(NaN);
    for (let j = 0; j < H; j++) {
      const y = Y0 + j * DY;
      for (let i = 0; i < W; i++) {
        const t = T0 + i * DT - (o.centre ?? 0);
        const tr = (t * Math.PI) / 180;
        let r = 85 + 12 * Math.cos(tr) ** 2 - ((y + 20) ** 2) / 400;
        // Nose ridge and chin along the midline.
        r += 14 * Math.exp(-(t * t) / 60) * Math.exp(-((y - 0) ** 2) / 300);
        r += (10 - (o.chinBack ?? 0)) * Math.exp(-(t * t) / 150) * Math.exp(-((y + 55) ** 2) / 120);
        r += 2 * (o.offsetX ?? 0) * Math.sin(tr);
        if (o.leftCheek && t > 0) r += o.leftCheek * Math.exp(-(((t - 40) ** 2) / 200 + ((y + 20) ** 2) / 200));
        r += (o.noise ?? 0) * rand();
        z[j * W + i] = r;
      }
    }
    return z;
  };
  return { a: make(), b: make(), width: W, height: H, thetaMinDeg: T0, thetaStepDeg: DT, yMinMm: Y0, yStepMm: DY };
}

const win = faceWindow(30);

test("a symmetric head reads ~0 mm", () => {
  const c = head();
  const s = cylSymmetry(mergeCyl(c), c, win)!;
  assert.ok(s.rmsMm < 0.05, `rms ${s.rmsMm}`);
});

test("a turned head and an off-centre axis are removed, not read as asymmetry", () => {
  const c = head({ centre: 2.5, offsetX: 1.5 });
  const s = cylSymmetry(mergeCyl(c), c, win)!;
  assert.ok(Math.abs(s.midlineDeg - 2.5) <= 0.5, `midline ${s.midlineDeg}`);
  assert.ok(s.rmsMm < 0.3, `rms ${s.rmsMm}`);
});

test("a fuller left cheek shows, mid-face, on the left", () => {
  const c = head({ leftCheek: 3 });
  const s = cylSymmetry(mergeCyl(c), c, win)!;
  assert.ok(s.rmsMm > 0.2, `rms ${s.rmsMm}`);
  assert.ok(s.leftMinusRightMm.middle > 0.2, `middle ${s.leftMinusRightMm.middle}`);
});

test("noise is measured from the two halves and taken out of the symmetry", () => {
  const c = head({ noise: 0.8, seed: 7 });
  const noise = cellNoiseMm(c, win)!;
  // Uniform ±0.8 has σ ≈ 0.46; half the RMS of A−B for the merged map ≈ 0.33.
  assert.ok(noise > 0.2 && noise < 0.45, `noise ${noise}`);
  const raw = cylSymmetry(mergeCyl(c), c, win, 0)!;
  const fair = cylSymmetry(mergeCyl(c), c, win, noise)!;
  assert.ok(fair.rmsMm < raw.rmsMm, "debiased reads lower");
  assert.ok(fair.rmsMm < 0.15, `noise alone is not asymmetry: ${fair.rmsMm}`);
});

test("widths need the scan to reach round both sides", () => {
  const c = head();
  const m = mergeCyl(c);
  assert.ok(bandWidthMm(m, c, -10, 20)! > 150);
  for (let j = 0; j < H; j++) for (let i = 0; i < 25; i++) m[j * W + i] = NaN; // right side stops at −75°
  assert.equal(bandWidthMm(m, c, -10, 20), null);
});

test("a receding chin reads further behind the nose", () => {
  const a = summariseCylinder(head(), 30, 60, 1);
  const b = summariseCylinder(head({ chinBack: 4 }), 30, 60, 1);
  assert.ok(b.chinBehindNoseMm! > a.chinBehindNoseMm! + 2, `${a.chinBehindNoseMm} → ${b.chinBehindNoseMm}`);
});

test("sweep-to-sweep change: alignment absorbed, real change located", () => {
  const c = head();
  const same = compareCyl(mergeCyl(c), mergeCyl(head({ centre: 2 })), c, win)!;
  assert.ok(same.rmsMm < 0.3, `re-posed head reads as no change: ${same.rmsMm}`);
  const fuller = compareCyl(mergeCyl(c), mergeCyl(head({ leftCheek: 3 })), c, win)!;
  assert.ok(fuller.byRegion.left > fuller.byRegion.right, "the left side grew");
});

test("sweep audio quickens as the ring fills", async () => {
  const { sweepGuidance } = await import("./truedepth-scan.ts");
  const early = sweepGuidance({ tracked: true, ok: true, message: "", collected: 6, target: 60, phase: "sweep" });
  const late = sweepGuidance({ tracked: true, ok: true, message: "", collected: 54, target: 60, phase: "sweep" });
  assert.ok(late.beepMs < early.beepMs);
  assert.equal(sweepGuidance({ tracked: true, ok: false, message: "Slower.", collected: 6, target: 60 }).phrase, "Slower.");
});

test("cheek width stops short of the ears", () => {
  // Big ears at ±95° and eye height: an ear-to-ear reading would be far wider.
  const c = head();
  const m = mergeCyl(c);
  for (let j = 0; j < H; j++) {
    const y = Y0 + j * DY;
    for (const e of [95, -95]) {
      // A real ear: ~10° round the head, not a one-cell spike.
      for (let d = -5; d <= 5; d++) {
        const i = e + d - T0;
        if (Math.abs(y - 5) < 25) m[j * W + i] = m[j * W + i]! + 20;
      }
    }
  }
  const earToEar = bandWidthMm(m, c, -10, 20);
  const cheeks = bandWidthMm(m, c, -10, 20, 75, 70);
  assert.ok(earToEar! - cheeks! > 20, `${earToEar} vs ${cheeks}`);
});

test("a few stray points off the side do not make a width up", () => {
  const c = head();
  const clean = bandWidthMm(mergeCyl(c), c, -10, 20, 95, 75)!;
  const m = mergeCyl(c);
  // Hair or noise: single cells 25 mm proud, scattered down both sides.
  for (let j = 0; j < H; j += 4) for (const t of [72, -72, 88, -88]) m[j * W + (t - T0)] = m[j * W + (t - T0)]! + 25;
  const noisy = bandWidthMm(m, c, -10, 20, 95, 75)!;
  assert.ok(Math.abs(noisy - clean) < 1, `${clean} → ${noisy}`);
});

test("a width needs solid coverage, not scattered points", () => {
  const c = head();
  const m = mergeCyl(c);
  for (let k = 0; k < m.length; k++) if (k % 3) m[k] = NaN; // two thirds missing
  assert.equal(bandWidthMm(m, c, -10, 20, 95, 75), null);
});
