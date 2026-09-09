import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseSkin, puffinessRatio, samplePatch } from "./skin.ts";
import { FACE } from "./landmarks.ts";
import type { Pt } from "./geometry.ts";

/** A flat image of one colour, as ImageData would arrive from a canvas. */
function flat(w: number, h: number, r: number, g: number, b: number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return { data: d, width: w, height: h } as ImageData;
}

/** Paint a filled circle, so a region can be made darker or redder than around it. */
function blot(img: ImageData, cx: number, cy: number, r: number, rgb: [number, number, number]) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
    }
  }
}

/** A face laid out on a 0-1 grid, mirrored about x = 0.5. */
function face(): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const put = (k: keyof typeof FACE, x: number, y: number) => { pts[FACE[k]] = { x, y }; };
  put("glabella", 0.5, 0.28);
  put("noseTip", 0.5, 0.48);
  put("chin", 0.5, 0.76);
  put("leftInner", 0.44, 0.38); put("rightInner", 0.56, 0.38);
  put("leftOuter", 0.34, 0.38); put("rightOuter", 0.66, 0.38);
  put("leftCheek", 0.30, 0.52); put("rightCheek", 0.70, 0.52);
  return pts;
}

test("a patch of one flat colour has no spread and no highlight", () => {
  const p = samplePatch(flat(60, 60, 120, 100, 90), { x: 0.5, y: 0.5 }, 0.15);
  assert.ok(p.n > 0);
  assert.ok(Math.abs(p.lumSd) < 1e-6, "a flat patch has zero variance, not a negative one");
  assert.equal(p.specular, 0);
});

test("a bright patch reads as specular, which is the oil proxy", () => {
  const p = samplePatch(flat(60, 60, 250, 250, 250), { x: 0.5, y: 0.5 }, 0.15);
  assert.equal(p.specular, 1);
});

test("redder pixels move a* up and greener move it down", () => {
  const red = samplePatch(flat(40, 40, 200, 120, 120), { x: 0.5, y: 0.5 }, 0.2);
  const green = samplePatch(flat(40, 40, 120, 200, 120), { x: 0.5, y: 0.5 }, 0.2);
  assert.ok(red.redA > 0);
  assert.ok(green.redA < 0);
});

test("a patch entirely off the image is empty, not a crash", () => {
  const p = samplePatch(flat(20, 20, 100, 100, 100), { x: 5, y: 5 }, 0.1);
  assert.equal(p.n, 0);
  assert.equal(p.lum, 0);
});

test("an even face has no under-eye darkness", () => {
  const img = flat(400, 400, 150, 120, 110);
  const r = analyseSkin(img, face());
  assert.ok(r.underEyeIndex != null);
  assert.ok(Math.abs(r.underEyeIndex!) < 1, `was ${r.underEyeIndex}`);
});

test("darkening under both eyes is picked up as a positive index", () => {
  const img = flat(400, 400, 150, 120, 110);
  // Just below each eye, where the infraorbital patch lands.
  blot(img, 0.39 * 400, 0.43 * 400, 14, [95, 75, 70]);
  blot(img, 0.61 * 400, 0.43 * 400, 14, [95, 75, 70]);
  const r = analyseSkin(img, face());
  assert.ok(r.underEyeIndex! > 5, `was ${r.underEyeIndex}`);
  assert.ok(r.underEyeL! > 5 && r.underEyeR! > 5, "both sides, since both were darkened");
});

test("the index is relative, so a dimmer photograph reads the same", () => {
  // The whole point: exposure must cancel, or you chase the lamp not the face.
  const bright = flat(400, 400, 180, 150, 140);
  const dim = flat(400, 400, 90, 75, 70);
  blot(bright, 0.39 * 400, 0.43 * 400, 14, [126, 105, 98]);
  blot(bright, 0.61 * 400, 0.43 * 400, 14, [126, 105, 98]);
  blot(dim, 0.39 * 400, 0.43 * 400, 14, [63, 52, 49]);
  blot(dim, 0.61 * 400, 0.43 * 400, 14, [63, 52, 49]);
  const a = analyseSkin(bright, face()).underEyeIndex!;
  const b = analyseSkin(dim, face()).underEyeIndex!;
  assert.ok(Math.abs(a - b) < 2, `${a} vs ${b} — halving the exposure moved it too much`);
});

test("redder cheeks than forehead read as erythema", () => {
  const img = flat(400, 400, 150, 120, 110);
  blot(img, 0.30 * 400, 0.52 * 400, 16, [190, 110, 100]);
  blot(img, 0.70 * 400, 0.52 * 400, 16, [190, 110, 100]);
  const r = analyseSkin(img, face());
  assert.ok(r.erythemaIndex! > 3, `was ${r.erythemaIndex}`);
});

test("a blotchy cheek is less even than a flat one", () => {
  const flatFace = analyseSkin(flat(400, 400, 150, 120, 110), face());
  const blotchy = flat(400, 400, 150, 120, 110);
  for (const [cx, cy] of [[0.28, 0.50], [0.32, 0.54], [0.68, 0.50], [0.72, 0.54]] as const) {
    blot(blotchy, cx * 400, cy * 400, 5, [200, 150, 140]);
  }
  assert.ok(analyseSkin(blotchy, face()).unevenness! > flatFace.unevenness!);
});

test("a face with no eyes measures nothing and says which", () => {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  pts[FACE.leftInner] = undefined as unknown as Pt;
  const r = analyseSkin(flat(100, 100, 150, 120, 110), pts);
  assert.equal(r.underEyeIndex, null);
  assert.match(r.missing.join(" "), /eyes/);
});

test("puffiness is cheek width over the bone between the eyes", () => {
  const base = puffinessRatio(face())!;
  const puffy = face();
  puffy[FACE.leftCheek] = { x: 0.26, y: 0.52 };
  puffy[FACE.rightCheek] = { x: 0.74, y: 0.52 };
  assert.ok(puffinessRatio(puffy)! > base, "a wider face reads as puffier");

  // Scale invariance: the same face photographed closer must read the same.
  const closer = face().map((p) => ({ x: 0.5 + (p.x - 0.5) * 1.4, y: 0.5 + (p.y - 0.5) * 1.4 }));
  assert.ok(Math.abs(puffinessRatio(closer)! - base) < 0.01, "camera distance must not move it");
});
