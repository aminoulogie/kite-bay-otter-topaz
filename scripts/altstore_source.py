#!/usr/bin/env python3
"""
Write the AltStore source for SOMA: the JSON file AltStore reads to list the
app, offer new versions as updates and download them.

Run by the iOS workflow after each build. The source keeps the newest build
first and the few before it, so a bad build can be rolled back from AltStore.

AltStore 2 checks what an app asks for against what its source declares, so
the entitlements are read from the project's .entitlements files (app and
widget) and the privacy strings from the built app's Info.plist — declared
by hand they would drift the first time either changed.
"""
import argparse
import datetime
import json
import os
import plistlib

KEEP = 10


def entitlements(paths):
    out = set()
    for p in paths:
        with open(p, "rb") as f:
            out.update(plistlib.load(f).keys())
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, help="the built App.app")
    ap.add_argument("--ipa", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--build", required=True)
    ap.add_argument("--download", required=True, help="the .ipa's public URL")
    ap.add_argument("--icon", required=True, help="the icon's public URL")
    ap.add_argument("--previous", help="the source as last published, if any")
    ap.add_argument("--entitlements", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    with open(os.path.join(a.app, "Info.plist"), "rb") as f:
        info = plistlib.load(f)
    privacy = {k: v for k, v in info.items() if k.startswith("NS") and k.endswith("UsageDescription")}

    version = {
        "version": a.version,
        "buildVersion": a.build,
        "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "localizedDescription": f"SOMA {a.version} (build {a.build}).",
        "downloadURL": a.download,
        "size": os.path.getsize(a.ipa),
        "minOSVersion": info.get("MinimumOSVersion", "16.2"),
    }

    older = []
    if a.previous and os.path.exists(a.previous):
        try:
            with open(a.previous) as f:
                prev = json.load(f)
            older = [v for v in prev["apps"][0]["versions"] if v.get("version") != a.version]
        except (ValueError, KeyError, IndexError, TypeError):
            older = []

    source = {
        "name": "SOMA",
        "identifier": "io.github.aminoulogie.soma.source",
        "subtitle": "Personal build",
        "iconURL": a.icon,
        "apps": [
            {
                "name": "SOMA",
                "bundleIdentifier": info["CFBundleIdentifier"],
                "developerName": "Amine Lassal",
                "subtitle": "Train, fuel, habits, time and mind.",
                "localizedDescription": "SOMA, the personal coach. Installs with its home-screen "
                "widget and lock-screen timer.",
                "iconURL": a.icon,
                "tintColor": "#c8ff2e",
                "category": "lifestyle",
                "versions": [version] + older[: KEEP - 1],
                "appPermissions": {
                    "entitlements": entitlements(a.entitlements),
                    "privacy": privacy,
                },
            }
        ],
        "news": [],
    }
    with open(a.out, "w") as f:
        json.dump(source, f, indent=2, ensure_ascii=False)
    print(f"AltStore source: SOMA {a.version}, {len(source['apps'][0]['versions'])} version(s)")


if __name__ == "__main__":
    main()
