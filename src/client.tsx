import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

/**
 * The client entry — TanStack Start's default, plus one thing.
 *
 * GitHub Pages and the phone serve a static shell (scripts/stage_static.py),
 * not a server render, so the document React hydrates never matches what it
 * would render: React says so (minified error #418), throws away the shell
 * and renders the app itself, which is exactly what should happen. Reported
 * through the default handler, that expected event surfaced as an uncaught
 * page error at every start, hiding any real one behind it. Only that one is
 * quieted; every other recoverable error is still reported.
 */
const HYDRATION_MISMATCH = /Minified React error #(418|423|425)\b|Hydration failed|didn't match/;

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    {
      onRecoverableError(error) {
        const message = error instanceof Error ? error.message : String(error);
        if (HYDRATION_MISMATCH.test(message)) return;
        console.error(error);
      },
    },
  );
});
