#!/usr/bin/env python3
"""
Write live.json: the web layer on offer for live updates, and the oldest
installed build it can run on.

The web layer calls into native code (Swift plugins, the widget, the plugins'
native halves), so a layer built against newer native code must not be sent
to an app installed before that code existed. The native side is fingerprinted
here — every tracked file under ios/ apart from the copied web assets, the
Capacitor config, and the versions of the Capacitor packages — and compared
with the last published manifest:

  * same fingerprint → the native side has not changed, so the layer runs on
    anything from the same `nativeSince` as before;
  * new fingerprint  → this build is the first with that native code, so
    `nativeSince` becomes this version and older installs are told to
    reinstall instead.

Also prints the verdict for the build log: "live" or "reinstall".
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess

EXCLUDE = ("ios/App/App/public/", "ios/App/App/capacitor.config.json", "ios/App/App/config.xml")


def native_fingerprint(root: str) -> str:
    files = subprocess.run(
        ["git", "ls-files", "ios", "capacitor.config.json"],
        cwd=root, capture_output=True, text=True, check=True,
    ).stdout.split()
    h = hashlib.sha256()
    for f in sorted(files):
        if f.startswith(EXCLUDE):
            continue
        h.update(f.encode())
        with open(os.path.join(root, f), "rb") as fh:
            h.update(hashlib.sha256(fh.read()).digest())
    with open(os.path.join(root, "package.json")) as fh:
        pkg = json.load(fh)
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    for name in sorted(deps):
        if name.startswith(("@capacitor/", "@capgo/")):
            h.update(f"{name}@{deps[name]}".encode())
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--url", required=True, help="the web layer zip's public URL")
    ap.add_argument("--previous", help="live.json as last published, if any")
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    fingerprint = native_fingerprint(a.root)
    since = a.version
    if a.previous and os.path.exists(a.previous):
        try:
            with open(a.previous) as fh:
                prev = json.load(fh)
            if prev.get("nativeHash") == fingerprint and isinstance(prev.get("nativeSince"), str):
                since = prev["nativeSince"]
        except (ValueError, OSError):
            pass

    manifest = {
        "version": a.version,
        "url": a.url,
        "nativeSince": since,
        "nativeHash": fingerprint,
        "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(a.out, "w") as fh:
        json.dump(manifest, fh, indent=2)
    verdict = "live" if since != a.version else "reinstall"
    print(f"Live update {a.version}: {verdict} (runs on builds from {since})")


if __name__ == "__main__":
    main()
