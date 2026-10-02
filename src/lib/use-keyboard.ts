import { useEffect } from "react";
import { FIELD_SELECTOR, IOS_ACCESSORY_H, insetFrom, keyboardTopFrom, liftFor } from "@/lib/keyboard";
import { Capacitor } from "@capacitor/core";

/**
 * Keep the keyboard out of the way of whatever is being typed into.
 *
 * Installed once, at the shell. Three jobs, none of which any individual
 * field should have to know about:
 *
 * **Publish the keyboard height as `--kb`.** Every sheet in the app is
 * `position: fixed` and pinned to the bottom of the screen, and on iOS that
 * bottom does not move when the keyboard opens — the layout viewport keeps its
 * full height and the keys are drawn over it. One CSS variable lets the
 * stylesheet end those overlays at the top of the keyboard instead, which is
 * what puts a field exactly above the keys rather than behind them.
 *
 * **Reveal the focused field, and only when it needs revealing.** The browser
 * does its own version of this and does it badly: it scrolls whatever
 * container it feels like, by whatever amount, including when the field was
 * already in clear space. Doing it deliberately — measure, and scroll by zero
 * unless there is a real overlap — is most of the difference between a page
 * that settles and a page that lurches on every tap.
 *
 * **Put the page back where it was.** When a field inside a fixed sheet is
 * focused, iOS scrolls the document behind the sheet anyway, even though
 * nothing there is what it is trying to reveal. You cannot see it happen; you
 * see it afterwards, when the sheet closes onto a completely different part of
 * the page. The scroll position is recorded when such a field takes focus and
 * restored when the keyboard goes away.
 */

/** The nearest ancestor that actually scrolls, or null for the page itself. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** True when the element sits inside something pinned to the viewport. */
function inFixedLayer(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

function isField(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(FIELD_SELECTOR);
}

export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport ?? null;
    const root = document.documentElement;

    let inset = 0;
    /** Where the page was before a sheet's field pulled it somewhere else. */
    let parked: number | null = null;
    let raf = 0;

    const reveal = () => {
      const el = document.activeElement;
      if (!isField(el)) return;
      const rect = el.getBoundingClientRect();
      // Inside a sheet: put the field in the MIDDLE of what is visible of the
      // sheet, not merely clear of the keys. A field revealed by the minimum
      // sat jammed against the keyboard or the sheet's top edge, with the
      // labels and buttons around it cut off.
      const sheet = el.closest<HTMLElement>(".soma-expand");
      if (sheet && sheet.scrollHeight > sheet.clientHeight + 4) {
        const box = sheet.getBoundingClientRect();
        const bottom = Math.min(box.bottom, keyboardTopFrom(viewport, window.innerHeight));
        const mid = (Math.max(box.top, 0) + bottom) / 2;
        const delta = (rect.top + rect.bottom) / 2 - mid;
        if (Math.abs(delta) > 12) {
          const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          sheet.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
        }
        return;
      }
      const lift = liftFor(
        rect.top,
        rect.bottom,
        keyboardTopFrom(viewport, window.innerHeight),
      );
      if (!lift) return;
      const box = scrollParent(el);
      const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const how: ScrollToOptions = { top: lift, behavior: smooth ? "smooth" : "auto" };
      if (box) box.scrollBy(how);
      else window.scrollBy(how);
    };

    // Where the VISIBLE part of the screen is while the keys are up. iOS
    // pans the page up to show the field, so the visible area starts
    // `offsetTop` down the layout viewport. Sheets are pinned to these two
    // values — ending at the keys alone left them as tall as the whole screen
    // minus the keys, and the pan pushed their top (title, close button, the
    // Expense/Income switch) off the top of the screen.
    let lastTop = -1;
    let lastH = -1;
    const pin = (open: boolean) => {
      const top = open && viewport ? Math.round(viewport.offsetTop) : 0;
      const strip = Capacitor.getPlatform() === "ios" ? IOS_ACCESSORY_H : 0;
      const h = open && viewport ? Math.round(viewport.height) - strip : 0;
      if (top === lastTop && h === lastH) return;
      lastTop = top;
      lastH = h;
      if (open) {
        root.style.setProperty("--vv-top", `${top}px`);
        root.style.setProperty("--vvh", `${h}px`);
      } else {
        root.style.removeProperty("--vv-top");
        root.style.removeProperty("--vvh");
      }
    };

    const measure = () => {
      const next = insetFrom(viewport, window.innerHeight);
      pin(next > 0);
      if (next === inset) return;
      inset = next;
      root.style.setProperty("--kb", `${next}px`);
      root.classList.toggle("soma-kb", next > 0);

      if (next > 0) {
        // The height arrives partway through the keyboard's own animation, so
        // the measurement that matters is the one taken on the next frame,
        // after the sheet has been laid out against the new `--kb`.
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(reveal);
      } else if (parked !== null) {
        // Keyboard gone. Undo whatever the browser did to the page behind the
        // sheet while it was open.
        const y = parked;
        parked = null;
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      if (inFixedLayer(e.target)) parked = window.scrollY;
      // The keyboard has not opened yet on the first focus of a session, so
      // this pass only catches a field that is already off-screen inside its
      // own scroller. `measure` handles it again once the keys are up.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reveal);
    };

    const onFocusOut = () => {
      // Moving between two fields keeps the keyboard up; only a focus that
      // lands nowhere should release the parked position, and even then the
      // restore waits for the keyboard to actually close.
      requestAnimationFrame(() => {
        if (!isField(document.activeElement) && inset === 0) {
          if (parked !== null) {
            const y = parked;
            parked = null;
            window.scrollTo({ top: y, behavior: "auto" });
          }
        }
      });
    };

    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      cancelAnimationFrame(raf);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--kb");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vvh");
      root.classList.remove("soma-kb");
    };
  }, []);
}
