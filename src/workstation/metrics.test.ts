import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../lib/projects.ts";
import { attention, clientsOf, projectStats, recentActivity } from "./metrics.ts";

const NOW = Date.parse("2026-10-05T12:00:00");
const T = "2026-10-05";
const p = (o: Partial<Project>): Project => ({ id: "x", name: "P", color: "#fff", steps: [], status: "active", createdAt: NOW, touchedAt: NOW, ...o });

const projects = [
  p({ id: "a", name: "Audit Acme", client: "Acme", due: "2026-10-01", steps: [{ id: "s1", label: "Kickoff", done: true, at: NOW - 3600_000 }, { id: "s2", label: "Fieldwork", done: false }] }),
  p({ id: "b", name: "Website", client: "Own", touchedAt: NOW - 20 * 86_400_000 }),
  p({ id: "c", name: "Report", client: "Acme", due: "2026-10-07" }),
  p({ id: "d", name: "Old", status: "done", steps: [{ id: "s3", label: "Ship", done: true, at: NOW - 86_400_000 }] }),
];

test("stats across projects", () => {
  assert.deepEqual(projectStats(projects, T, NOW), { active: 3, overdue: 1, stale: 1, dueSoon: 1, stepsWeek: 2, openSteps: 1 });
});

test("attention puts overdue first, then overdue to-dos, due soon, stale", () => {
  const list = attention(projects, [{ id: "t", text: "Send invoice", done: false, due: "2026-10-03" }], T, NOW);
  assert.deepEqual(list.map((i) => i.kind), ["overdue", "todo-overdue", "due-soon", "stale"]);
  assert.match(list[0]!.detail, /Acme · 4 days overdue/);
});

test("activity newest first, clients by use", () => {
  assert.deepEqual(recentActivity(projects).map((a) => a.step), ["Kickoff", "Ship"]);
  assert.deepEqual(clientsOf(projects), ["Acme", "Own"]);
});
