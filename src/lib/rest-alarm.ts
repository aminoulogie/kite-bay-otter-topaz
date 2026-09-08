/**
 * Telling the user their rest is over, by whatever route the device allows.
 *
 * The routes differ enormously and it is worth being blunt about which is
 * which, because "add a notification" means three different things here:
 *
 *   - NATIVE (Capacitor build): a local notification scheduled for the
 *     deadline. Arrives on the lock screen with the app closed. This is the
 *     one that actually works in a gym.
 *   - INSTALLED WEB APP: no scheduling. Safari has no Notification Triggers
 *     API, so a notification can only be shown while JavaScript is running,
 *     which it is not once the screen locks. Sound and vibration still fire
 *     the moment the app is foregrounded again.
 *   - BROWSER TAB: sound and vibration only.
 *
 * A Live Activity — the countdown that sits on the lock screen and in the
 * Dynamic Island and updates itself — is a WidgetKit extension written in
 * Swift. It cannot be reached from a web view at all, by any of these routes.
 * It is a real thing to build, but it is a native target, not a change here.
 */

/** Whether a real scheduled notification is possible on this device. */
export function canSchedule(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

/**
 * A short two-tone chime, synthesised rather than shipped as a file.
 *
 * An audio file would be another network request and another thing to cache;
 * this is a few lines of oscillator. Deliberately quiet and short — it fires
 * next to your ear in a quiet room as often as in a loud gym.
 */
export async function chime(): Promise<void> {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Autoplay policy parks the context until a gesture; starting the timer is
    // that gesture, so by now it usually resumes without complaint.
    if (ctx.state === "suspended") await ctx.resume();

    const now = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = now + i * 0.16;
      // Ramped rather than switched: a square-edged gain change is a click.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    }
    // Let the sound finish before tearing the context down, or it is cut off.
    setTimeout(() => void ctx.close(), 700);
  } catch {
    // No audio is not a reason to fail a set.
  }
}

/** A short buzz. Ignored by iOS Safari, which has no Vibration API. */
export function buzz(): void {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* not worth breaking the timer over */
  }
}

/**
 * Show a notification now, if one is permitted.
 *
 * Only useful while the app is running — see the header. It is still worth
 * doing: on Android, and on a desktop browser, the app is often backgrounded
 * rather than frozen, and this reaches the user there.
 */
export async function notifyNow(title: string, body: string): Promise<boolean> {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "denied") return false;
    if (Notification.permission === "default") return false;
    const reg = await navigator.serviceWorker?.getRegistration();
    // Through the service worker where there is one: a Notification
    // constructed on the page is not allowed on Android Chrome.
    if (reg) {
      await reg.showNotification(title, { body, tag: "soma-rest", silent: false });
      return true;
    }
    new Notification(title, { body, tag: "soma-rest" });
    return true;
  } catch {
    return false;
  }
}

/** Ask for permission, at a moment the user has just asked for a timer. */
export async function askNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
