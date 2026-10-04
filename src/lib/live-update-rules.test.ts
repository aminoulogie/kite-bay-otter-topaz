import assert from "node:assert/strict";
import { test } from "node:test";
import { asManifest, compareVersions, decide } from "./live-update-rules.ts";

test("versions compare part by part, not as text", () => {
  assert.equal(compareVersions("0.0.150", "0.0.99"), 1);
  assert.equal(compareVersions("0.0.99", "0.0.150"), -1);
  assert.equal(compareVersions("0.0.150", "0.0.150"), 0);
  assert.equal(compareVersions("1.0", "0.9.9"), 1);
});

const SUM = "a".repeat(64);
const m = { version: "0.0.150", url: "https://x/web.zip", nativeSince: "0.0.146", checksum: SUM };

test("a newer layer for this native build is downloaded", () => {
  assert.deepEqual(decide(m, "0.0.147", "0.0.147"), { kind: "update", version: "0.0.150", url: "https://x/web.zip", checksum: SUM });
});

test("nothing newer means nothing to do", () => {
  assert.equal(decide(m, "0.0.150", "0.0.147").kind, "current");
  assert.equal(decide(m, "0.0.151", "0.0.151").kind, "current");
});

test("a layer needing newer native code asks for a reinstall instead", () => {
  assert.deepEqual(decide(m, "0.0.145", "0.0.145"), { kind: "reinstall", version: "0.0.150", nativeSince: "0.0.146" });
});

test("a live-updated app still judges by the build it has installed", () => {
  // Web layer already moved on to 0.0.148 over the air; native is still 0.0.146.
  assert.equal(decide(m, "0.0.148", "0.0.146").kind, "update");
});

test("only a well-formed https manifest is trusted", () => {
  assert.equal(asManifest({ version: "1", url: "http://x", nativeSince: "1" }), null);
  assert.equal(asManifest({ version: "1" }), null);
  assert.ok(asManifest(m));
});

test("a manifest without the checksum the updater needs offers nothing", () => {
  const { checksum: _c, ...bare } = m;
  assert.equal(decide(bare, "0.0.147", "0.0.147").kind, "current");
});
