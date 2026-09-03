#!/usr/bin/env python3
"""
Turn the Vite/TanStack Start build into a static bundle that boots without a
server.

Runs for two targets now, which is why it is a file rather than a heredoc in a
workflow:

  * GitHub Pages  — served under /<repo>, so the router needs that basepath.
  * Capacitor/iOS — served from the root of a native webview, so no basepath,
    and no service worker (the app is already local; a worker would only add a
    second, staler cache).

Usage:
    python scripts/stage_static.py --base /kite-bay-otter-topaz
    python scripts/stage_static.py --base "" --no-sw
"""

import argparse
import json
import pathlib
import time

OUT = pathlib.Path(".vercel/output/static")


def patch_bundles(assets: pathlib.Path, base: str) -> None:
    """
    Two rewrites make an SSR bundle run as a static page.

    The basepath rewrite teaches the router its subpath. The second disables an
    SSR-only store hydration that otherwise waits for a server handoff that
    never arrives and leaves a black screen.

    Both match MINIFIED output and the second matches a mangled identifier any
    minifier bump may rename, so each is asserted: a silent miss ships a blank
    app, and a red build is better than a black screen.
    """
    basepath_hit = False
    ssr_guard_hit = False

    for p in assets.glob("*.js"):
        text = p.read_text(encoding="utf-8")
        patched = text

        if base:
            patched = patched.replace("basepath:``", f"basepath:`{base}`")
            patched = patched.replace('basepath:""', f'basepath:"{base}"')
            if patched != text:
                basepath_hit = True
        else:
            # An empty base IS the built-in value, so there is nothing to
            # rewrite and nothing to assert.
            basepath_hit = True

        before = patched
        patched = patched.replace("e.stores.ids.get().length||await Qn(e)", "0")
        if patched != before:
            ssr_guard_hit = True

        if patched != text:
            p.write_text(patched, encoding="utf-8")
            print("patched", p.name)

    if not basepath_hit:
        raise SystemExit(
            "FATAL: router basepath rewrite matched nothing. Every route would resolve "
            f"against / instead of {base}. The minified shape of `basepath:` changed — "
            "re-derive it from .vercel/output/static/assets/index-*.js."
        )
    if not ssr_guard_hit:
        raise SystemExit(
            "FATAL: SSR store-hydration rewrite matched nothing. The bundle would await a "
            "server handoff that never arrives and render a black screen. The mangled "
            "identifier was renamed by the minifier — re-derive it from the built bundle."
        )


def write_shell(base: str, js: str, css: str, with_sw: bool) -> None:
    sw = (
        f"""
      <script>
        if ('serviceWorker' in navigator) {{
          addEventListener('load', function () {{
            navigator.serviceWorker.register('{base}/sw.js', {{ scope: '{base}/' }});
          }});
        }}
      </script>"""
        if with_sw
        else ""
    )

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0c10" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="SOMA" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <title>SOMA</title>
    <link rel="manifest" href="{base}/__grok/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="{base}/icon-192.png" />
    <link rel="icon" href="{base}/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="{base}/assets/{css}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Manrope:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap" />
  </head>
  <body class="antialiased" style="margin:0;background:#0b0c10;color:#eceef1">
    <script>
      window.TSR_BOOT = true;
      window['$_TSR'] = window['$_TSR'] || {{
        buffer: [],
        initialized: false,
        h: function () {{}},
        router: {{ manifest: {{ routes: {{}} }}, matches: [] }}
      }};
    </script>
    <script type="module" src="{base}/assets/{js}"></script>{sw}
  </body>
</html>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    (OUT / "404.html").write_text(html, encoding="utf-8")


def write_manifest(base: str) -> None:
    grok = OUT / "__grok"
    grok.mkdir(parents=True, exist_ok=True)
    (grok / "manifest.webmanifest").write_text(
        json.dumps(
            {
                "name": "SOMA",
                "short_name": "SOMA",
                "id": f"{base}/",
                "start_url": f"{base}/",
                "scope": f"{base}/",
                "display": "standalone",
                "background_color": "#0b0c10",
                "theme_color": "#0b0c10",
                "icons": [
                    {"src": f"{base}/icon-192.png", "sizes": "192x192", "type": "image/png"},
                    {"src": f"{base}/icon-512.png", "sizes": "512x512", "type": "image/png"},
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def write_sw(base: str, assets: pathlib.Path, js: str, css: str) -> None:
    precache = [
        f"{base}/",
        f"{base}/index.html",
        f"{base}/assets/{js}",
        f"{base}/assets/{css}",
    ]
    precache += [f"{base}/assets/{p.name}" for p in assets.glob("routes-*.js")]
    precache += [f"{base}/assets/{p.name}" for p in assets.glob("*.wasm")]
    precache += [f"{base}/__grok/manifest.webmanifest", f"{base}/favicon.svg", f"{base}/icon-192.png"]

    # cache.addAll() rejects atomically: one 404 and nothing is cached at all,
    # with no error surfaced anywhere. Keep only paths that exist.
    kept = []
    for u in precache:
        rel = u[len(base) + 1 :] if base else u.lstrip("/")
        if not rel or (OUT / rel).exists():
            kept.append(u)
        else:
            print("skipping absent precache entry:", u)

    template = pathlib.Path("scripts/sw-template.js").read_text(encoding="utf-8")
    sw = (
        template.replace("__CACHE__", "soma-" + time.strftime("%Y%m%d%H%M%S"))
        .replace("__PRECACHE__", json.dumps(kept))
        .replace("__BASE__", base)
    )
    if "__CACHE__" in sw or "__PRECACHE__" in sw or "__BASE__" in sw:
        raise SystemExit("FATAL: sw-template.js placeholders were not all substituted.")
    (OUT / "sw.js").write_text(sw, encoding="utf-8")
    print("service worker precaching", len(kept), "entries")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help='URL prefix, e.g. "/repo" or "" for root')
    ap.add_argument("--no-sw", action="store_true", help="skip the service worker (native builds)")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    assets = OUT / "assets"
    patch_bundles(assets, base)

    js = next(assets.glob("index-*.js")).name
    css = next(assets.glob("styles-*.css")).name

    write_shell(base, js, css, with_sw=not args.no_sw)
    write_manifest(base)
    if not args.no_sw:
        write_sw(base, assets, js, css)
    else:
        # A native build is already local; a worker would only add a second,
        # staler cache in front of files that never change between updates.
        (OUT / "sw.js").unlink(missing_ok=True)

    print("staged", js, css, "at", base or "/")


if __name__ == "__main__":
    main()
