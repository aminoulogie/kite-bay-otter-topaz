import assert from "node:assert/strict";
import { test } from "node:test";
import { postureFromSideFrame, type PoseLandmark } from "./analyzePosture.ts";
import { POSE } from "./landmarks.ts";

/** 33 hidden points, then the ones a test cares about. */
function frame(parts: Partial<Record<keyof typeof POSE, PoseLandmark>>): PoseLandmark[] {
  const lms: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.05 }));
  for (const [k, v] of Object.entries(parts)) lms[POSE[k as keyof typeof POSE]] = v!;
  return lms;
}

const profile = (earX: number) =>
  frame({
    leftEar: { x: earX, y: 0.3, visibility: 0.95 },
    rightEar: { x: earX, y: 0.3, visibility: 0.2 },
    leftShoulder: { x: 0.5, y: 0.6, visibility: 0.9 },
    rightShoulder: { x: 0.5, y: 0.6, visibility: 0.9 },
  });

test("no visible shoulder means no posture claim", () => {
  const lms = profile(0.55);
  lms[POSE.leftShoulder]!.visibility = 0.1;
  lms[POSE.rightShoulder]!.visibility = 0.1;
  assert.equal(postureFromSideFrame(lms, 1080, 1440), null);
});

test("no visible ear means no posture claim", () => {
  const lms = profile(0.55);
  lms[POSE.leftEar]!.visibility = 0.1;
  lms[POSE.rightEar]!.visibility = 0.1;
  assert.equal(postureFromSideFrame(lms, 1080, 1440), null);
});

test("a head further forward reads a smaller neck angle", () => {
  const stacked = postureFromSideFrame(profile(0.52), 1080, 1440)!;
  const forward = postureFromSideFrame(profile(0.62), 1080, 1440)!;
  assert.ok(stacked.cvaEst! > forward.cvaEst!, `${stacked.cvaEst} should exceed ${forward.cvaEst}`);
});

test("the same pose gives the same angle whatever the photo's shape", () => {
  // One physical pose, photographed portrait and landscape: normalised x
  // differs, pixel geometry does not.
  const earPx = { x: 640, y: 360 };
  const shPx = { x: 540, y: 820 };
  const shot = (w: number, h: number) =>
    frame({
      leftEar: { x: earPx.x / w, y: earPx.y / h, visibility: 0.9 },
      leftShoulder: { x: shPx.x / w, y: shPx.y / h, visibility: 0.9 },
      rightShoulder: { x: shPx.x / w, y: shPx.y / h, visibility: 0.9 },
    });
  const portrait = postureFromSideFrame(shot(1080, 1440), 1080, 1440)!;
  const landscape = postureFromSideFrame(shot(1920, 1440), 1920, 1440)!;
  assert.ok(Math.abs(portrait.cvaEst! - landscape.cvaEst!) < 1e-6, `${portrait.cvaEst} vs ${landscape.cvaEst}`);
});
