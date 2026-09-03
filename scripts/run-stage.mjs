// Thin wrapper so the staging targets are one npm script each, and so the
// arguments cannot drift between package.json and the workflows.
import { spawnSync } from "node:child_process";

const target = process.argv[2];
const args =
  target === "native"
    ? ["scripts/stage_static.py", "--base", "", "--no-sw"]
    : ["scripts/stage_static.py", "--base", `/${process.env.REPO ?? "kite-bay-otter-topaz"}`];

const py = process.platform === "win32" ? "python" : "python3";
const r = spawnSync(py, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
