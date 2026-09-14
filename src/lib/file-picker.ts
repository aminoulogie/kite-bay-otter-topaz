/**
 * Asking the phone for a file, and actually getting it.
 *
 * A hidden `<input type="file">` is the only way to open the system picker
 * from a web app, and every awkward part of this file is something iOS does
 * that the obvious version gets wrong.
 */

/**
 * How long to wait, after the picker closes, before deciding nothing came.
 *
 * The old number was 400ms and it was the bug: picking a book from Files
 * looked like nothing at all had happened. iOS dismisses the sheet the
 * instant you tap a file and only THEN copies it into the app's sandbox —
 * for anything in iCloud Drive that is a download, and a 40MB book takes
 * seconds. The window regains focus at dismissal, so a short timer fires
 * first, the promise resolves empty, and the file lands moments later with
 * nobody listening.
 *
 * Generous on purpose. The cost of waiting too long is that a CANCEL feels
 * unresponsive for a moment, and the cost of not waiting long enough is that
 * the feature silently does not work.
 */
export const CANCEL_GRACE_MS = 2500;

export interface PickOptions {
  /** Extensions and media types, e.g. ".pdf,.epub,application/pdf". */
  accept?: string;
  multiple?: boolean;
  /** "environment" opens the rear camera directly, where there is one. */
  capture?: "environment" | "user";
  /** Test seam: how long to wait after the picker closes. */
  graceMs?: number;
}

export function pickFiles(options: PickOptions = {}): Promise<File[]> {
  const { accept, multiple = false, capture, graceMs = CANCEL_GRACE_MS } = options;

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    if (multiple) input.multiple = true;
    if (capture) input.capture = capture;

    // Transparent and out of the way, NOT `display: none`. Safari has a long
    // history of refusing to open a picker for an input that was never laid
    // out, and an element with no box is easy for a browser to treat as one
    // the user could not possibly have meant to activate.
    input.style.position = "fixed";
    input.style.left = "0";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);

    /**
     * Whether the picker ever actually took the screen.
     *
     * The window has to LOSE focus before regaining it can mean anything. Tab
     * back from another app, or a stray focus event fired by the click
     * itself, would otherwise be read as "the picker closed with nothing in
     * it" before the picker had even opened.
     */
    let opened = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBlur = () => {
      opened = true;
    };

    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(files);
    };

    const filesNow = () => Array.from(input.files ?? []);

    function onFocus() {
      if (!opened || settled) return;
      if (timer !== undefined) clearTimeout(timer);
      // One last look before giving up: `change` normally beats this, but on a
      // slow copy the files can appear on the input without the event having
      // been processed yet.
      timer = setTimeout(() => {
        const late = filesNow();
        done(late);
      }, graceMs);
    }

    input.addEventListener("change", () => done(filesNow()));
    // Safari 16.4 and Chrome 113 fire this when the picker is dismissed with
    // nothing chosen, which is an exact answer rather than a guess — so where
    // it exists, the grace period above never has to run at all.
    input.addEventListener("cancel", () => done([]));
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    input.click();
  });
}
