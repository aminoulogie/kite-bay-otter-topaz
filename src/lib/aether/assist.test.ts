import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beepInterval, cropForZoom, guide, laplacianVariance, median, mergeSymmetry, rankFrames, turnedSide,
  type AssistInput,
} from "./assist.ts";

const input = (over: Partial<AssistInput> = {}): AssistInput => ({
  kind: "face_oblique",
  hasFace: true,
  yawDeg: 40,
  pitchDeg: 0,
  rollDeg: 0,
  turned: "right",
  quality: { ready: false, lighting: 0.85, reasons: [] },
  faceHeightFrac: 0.45,
  smile: 0,
  ...over,
});

test("the camera sees you like a person facing you: nose to image-left means you turned right", () => {
  assert.equal(turnedSide(0.44, 0.40, 0.56), "right");
  assert.equal(turnedSide(0.54, 0.40, 0.56), "left");
  assert.equal(turnedSide(0.481, 0.40, 0.56), null, "inside the dead zone is square to camera");
});

test("a green frame is a steady hold tone", () => {
  const g = guide(input({ quality: { ready: true, lighting: 0.85, reasons: [] } }));
  assert.equal(g.instruction, "hold");
  assert.equal(g.beepMs, 0);
});

test("no face is the slowest beep and says so", () => {
  const g = guide(input({ hasFace: false }));
  assert.equal(g.instruction, "find");
  assert.equal(g.beepMs, beepInterval(1));
});

test("under-turned for 45°: keep turning the same way, sound from that side", () => {
  const g = guide(input({ yawDeg: 12, turned: "left" }));
  assert.equal(g.instruction, "turn");
  assert.equal(g.side, "left");
  assert.equal(g.pan, -1);
  assert.match(g.phrase, /left/);
});

test("square to the camera on the profile step defaults to a turn to the right, like the guides", () => {
  const g = guide(input({ kind: "face_side", yawDeg: 2, turned: null }));
  assert.equal(g.side, "right");
  assert.equal(g.pan, 1);
});

test("over-turned: come back the other way", () => {
  const g = guide(input({ yawDeg: 75, turned: "right" }));
  assert.equal(g.instruction, "ease");
  assert.equal(g.side, "left");
  assert.equal(g.pan, -1);
});

test("closer to the target beeps faster", () => {
  const far = guide(input({ yawDeg: 5 }));
  const near = guide(input({ yawDeg: 24 }));
  assert.ok(near.beepMs < far.beepMs, `${near.beepMs} should be < ${far.beepMs}`);
});

test("chin down is corrected upward with a higher pitch, and vice versa", () => {
  const down = guide(input({ pitchDeg: 25 }));
  const up = guide(input({ pitchDeg: -25 }));
  assert.equal(down.instruction, "chinUp");
  assert.equal(up.instruction, "chinDown");
  assert.ok(down.pitchHz > up.pitchHz);
});

test("darkness outranks pose", () => {
  const g = guide(input({ yawDeg: 5, quality: { ready: false, lighting: 0.25, reasons: [] } }));
  assert.equal(g.instruction, "light");
});

test("distance is fixed before pose", () => {
  assert.equal(guide(input({ faceHeightFrac: 0.15, yawDeg: 5 })).instruction, "closer");
  assert.equal(guide(input({ faceHeightFrac: 0.85, yawDeg: 5 })).instruction, "back");
});

test("front step: a turned head is told to face the camera", () => {
  const g = guide(input({ kind: "face_front_true", yawDeg: 20, turned: "left" }));
  assert.equal(g.instruction, "ease");
  assert.equal(g.phrase, "Face the camera.");
});

test("zoom crops the centre and keeps the frame's shape", () => {
  assert.deepEqual(cropForZoom(1080, 1440, 1), { sx: 0, sy: 0, sw: 1080, sh: 1440 });
  assert.deepEqual(cropForZoom(1080, 1440, 2), { sx: 270, sy: 360, sw: 540, sh: 720 });
  assert.deepEqual(cropForZoom(1080, 1440, 0.5), cropForZoom(1080, 1440, 1), "never zooms out");
});

function checker(w: number, h: number, blur: boolean): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Blurred version: a smooth ramp instead of hard edges.
      const v = blur ? 128 + 60 * Math.sin(x / 6) : ((x >> 2) + (y >> 2)) % 2 ? 230 : 25;
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

test("a sharp frame scores higher focus than a soft one", () => {
  assert.ok(laplacianVariance(checker(40, 40, false), 40, 40) > laplacianVariance(checker(40, 40, true), 40, 40));
});

test("ranking prefers quality, then sharpness", () => {
  const ranked = rankFrames([
    { id: "soft", overall: 0.9, sharpness: 10 },
    { id: "sharp", overall: 0.9, sharpness: 100 },
    { id: "bad", overall: 0.3, sharpness: 100 },
  ]);
  assert.deepEqual(ranked.map((f) => f.id), ["sharp", "soft", "bad"]);
});

test("median ignores non-numbers and handles even counts", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("merge takes the median of the frames that passed, so one bad frame cannot set the number", () => {
  const m = mergeSymmetry([
    { alpha: 0.02, regional: { eyes: 0.1 }, gatesOk: true },
    { alpha: 0.03, regional: { eyes: 0.2 }, gatesOk: true },
    { alpha: 0.025, regional: { eyes: 0.3 }, gatesOk: true },
    { alpha: 0.4, regional: { eyes: 0.9 }, gatesOk: false }, // caught mid-turn
  ])!;
  assert.equal(m.alpha, 0.025);
  assert.equal(m.regional.eyes, 0.2);
  assert.equal(m.used, 3);
  assert.equal(mergeSymmetry([]), null);
});
