export type Pt = { x: number; y: number; z?: number };

export function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) };
}

export function scale(a: Pt, s: number): Pt {
  return { x: a.x * s, y: a.y * s, z: (a.z ?? 0) * s };
}

export function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

export function norm(a: Pt): number {
  return Math.hypot(a.x, a.y, a.z ?? 0);
}

export function normalize(a: Pt): Pt {
  const n = norm(a) || 1;
  return scale(a, 1 / n);
}

export function angleDeg(u: Pt, v: Pt): number {
  const c = Math.min(1, Math.max(-1, dot(normalize(u), normalize(v))));
  return (Math.acos(c) * 180) / Math.PI;
}

export function atan2deg(y: number, x: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function craniovertebralAngle(tragus: Pt, c7: Pt): number {
  const dx = tragus.x - c7.x;
  const dy = -(tragus.y - c7.y);
  return Math.abs(atan2deg(dy, dx));
}

export function lineAngleVsHorizontal(a: Pt, b: Pt): number {
  return atan2deg(b.y - a.y, b.x - a.x);
}

export function centroidSafe(pts: Pt[]): Pt {
  const n = pts.length || 1;
  const acc = pts.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 });
  return scale(acc, 1 / n);
}

export function centroid(pts: Pt[]): Pt {
  return centroidSafe(pts);
}

export function centroidSize(pts: Pt[]): number {
  const c = centroidSafe(pts);
  return Math.sqrt(pts.reduce((s, p) => s + dist(p, c) ** 2, 0));
}

export function unitCentered(pts: Pt[]): Pt[] {
  const c = centroidSafe(pts);
  const A0 = pts.map((p) => sub(p, c));
  const s = Math.sqrt(A0.reduce((acc, p) => acc + p.x * p.x + p.y * p.y, 0)) || 1;
  return A0.map((p) => scale(p, 1 / s));
}

export function procrustesAlign(moving: Pt[], target: Pt[]): Pt[] {
  const n = Math.min(moving.length, target.length);
  const An = unitCentered(moving.slice(0, n));
  const Bn = unitCentered(target.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += An[i].x * Bn[i].y - An[i].y * Bn[i].x;
    den += An[i].x * Bn[i].x + An[i].y * Bn[i].y;
  }
  const theta = Math.atan2(num, den);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return An.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}

export function procrustesDistance(a: Pt[], b: Pt[]): number {
  const aligned = procrustesAlign(a, b);
  const Bn = unitCentered(b.slice(0, aligned.length));
  let s = 0;
  for (let i = 0; i < aligned.length; i++) s += dist(aligned[i], Bn[i]) ** 2;
  return Math.sqrt(s / Math.max(1, aligned.length));
}

export function robustMidlineX(points: Pt[]): number {
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  if (!xs.length) return 0.5;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
