import assert from "node:assert/strict";
import { test } from "node:test";
import { eulerFromMatrix4 } from "./pose-angles.ts";

type M3 = number[][];
const rad = (d: number) => (d * Math.PI) / 180;

// MediaPipe metric space: X right, Y up, Z toward the camera.
const Ry = (d: number): M3 => {
  const c = Math.cos(rad(d)), s = Math.sin(rad(d));
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
};
const Rx = (d: number): M3 => {
  const c = Math.cos(rad(d)), s = Math.sin(rad(d));
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
};
const Rz = (d: number): M3 => {
  const c = Math.cos(rad(d)), s = Math.sin(rad(d));
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
};
const mul = (a: M3, b: M3): M3 =>
  a.map((row, i) => b[0].map((_, j) => row.reduce((acc, _v, k) => acc + a[i][k] * b[k][j], 0)));

/** 3x3 rotation (+ translation, + optional uniform scale) → column-major 4x4. */
function toColumnMajor(R: M3, t = [0.01, -0.02, -40], scale = 1): number[] {
  const m: number[] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) m.push(R[i][j] * scale);
    m.push(0);
  }
  m.push(t[0], t[1], t[2], 1);
  return m;
}

function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ${expected}, got ${actual}`);
}

test("a frontal face reads zero on every axis", () => {
  const a = eulerFromMatrix4(toColumnMajor(Ry(0)))!;
  close(a.yawDeg, 0, "yaw");
  close(a.pitchDeg, 0, "pitch");
  close(a.rollDeg, 0, "roll");
});

test("turning the head 45° is YAW 45° — the regression that broke the 45° step", () => {
  const a = eulerFromMatrix4(toColumnMajor(Ry(45)))!;
  close(a.yawDeg, 45, "yaw");
  close(a.pitchDeg, 0, "pitch");
  close(a.rollDeg, 0, "roll");
});

test("a near-profile turn reads as yaw, not pitch", () => {
  const a = eulerFromMatrix4(toColumnMajor(Ry(-72)))!;
  close(a.yawDeg, -72, "yaw");
  close(a.pitchDeg, 0, "pitch");
});

test("an ear-to-shoulder tilt is ROLL, not yaw", () => {
  const a = eulerFromMatrix4(toColumnMajor(Rz(10)))!;
  close(a.rollDeg, 10, "roll");
  close(a.yawDeg, 0, "yaw");
  close(a.pitchDeg, 0, "pitch");
});

test("a nod is PITCH, and chin-down is positive like the landmark proxy", () => {
  const a = eulerFromMatrix4(toColumnMajor(Rx(12)))!;
  close(a.pitchDeg, 12, "pitch");
  close(a.yawDeg, 0, "yaw");
  close(a.rollDeg, 0, "roll");
});

test("combined turn + nod + tilt is recovered exactly in turn-nod-tilt order", () => {
  const R = mul(mul(Ry(38), Rx(-7)), Rz(3));
  const a = eulerFromMatrix4(toColumnMajor(R))!;
  close(a.yawDeg, 38, "yaw");
  close(a.pitchDeg, -7, "pitch");
  close(a.rollDeg, 3, "roll");
});

test("a uniform scale in the matrix does not bend the angles", () => {
  const a = eulerFromMatrix4(toColumnMajor(mul(Ry(30), Rx(5)), undefined, 3.7))!;
  close(a.yawDeg, 30, "yaw");
  close(a.pitchDeg, 5, "pitch");
});

test("missing, short or degenerate matrices return null instead of a guess", () => {
  assert.equal(eulerFromMatrix4(undefined), null);
  assert.equal(eulerFromMatrix4([1, 0, 0]), null);
  assert.equal(eulerFromMatrix4(new Array(16).fill(0)), null);
});
