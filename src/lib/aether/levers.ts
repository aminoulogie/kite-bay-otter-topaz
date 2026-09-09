/**
 * What actually changes a face, over what timescale, and how you would know.
 *
 * This is the spine of the whole Looks tab, and it exists because the subject
 * is full of confident nonsense. Every lever here names three things: what it
 * plausibly moves, how long that takes, and WHICH MEASUREMENT would show it.
 * A lever with no measurement is a belief, and is marked as one.
 *
 * The evidence grades are about the effect on APPEARANCE, not on health.
 * Flossing has excellent evidence for gum health and almost none for how you
 * look in a photograph; both are true and the app should not blur them.
 *
 * ## The rule this file exists to enforce
 *
 * Nothing here claims to change adult bone. Not mewing, not chewing, not hard
 * food, not posture drills, not massage. Those claims are the reason people
 * spend years on this and get nothing, and an app that repeats them is worse
 * than no app. Posture changes how a skull is AIMED, which changes how it
 * photographs, which is real and worth training — and is not the same claim.
 */

export type Evidence = "strong" | "moderate" | "weak" | "none";
export type Horizon = "days" | "weeks" | "months" | "years" | "never";

export interface Lever {
  id: string;
  label: string;
  /** What it plausibly moves, in the app's own words. */
  moves: string;
  horizon: Horizon;
  evidence: Evidence;
  /**
   * The measurement that would show it working, or null when the app cannot
   * measure it. Null is not a criticism of the lever — sunscreen is the single
   * best thing on this list and its payoff is invisible for years.
   */
  metric: string | null;
  /** The habit id this lever is driven by, where one exists. */
  habit?: string;
  note: string;
}

/**
 * Ordered by how much they matter, not by how popular they are.
 *
 * The first four are, for almost everyone, the whole game. Everything below
 * them is refinement, and several things people spend the most time on are at
 * the bottom because they belong there.
 */
export const LEVERS: Lever[] = [
  {
    id: "bodyfat",
    label: "Body fat",
    moves: "Jawline definition, submental fullness, cheek hollowing",
    horizon: "months",
    evidence: "strong",
    metric: "Puffiness ratio and bodyweight",
    note:
      "The largest single lever on most faces, and the one this app is already " +
      "built to support. Nothing else on this list competes with it.",
  },
  {
    id: "sleep",
    label: "Sleep",
    moves: "Under-eye darkness, morning puffiness, skin tone",
    horizon: "days",
    evidence: "strong",
    metric: "Under-eye index, puffiness ratio",
    habit: "sleep",
    note:
      "Fast enough to see in a week of scans, which makes it the best lever to " +
      "prove the measurements are working at all.",
  },
  {
    id: "sunscreen",
    label: "Daily sunscreen",
    moves: "Long-term texture, pigment, elasticity",
    horizon: "years",
    evidence: "strong",
    metric: null,
    habit: "sunscreen",
    note:
      "The highest-value thing on this list and the one you will never see " +
      "working. Photoaging is most of what people call ageing. Not measurable " +
      "here, and doing it anyway is the point.",
  },
  {
    id: "sodium",
    label: "Sodium and alcohol",
    moves: "Overnight water retention",
    horizon: "days",
    evidence: "strong",
    metric: "Puffiness ratio",
    note:
      "Shows up by the next morning and clears in two. If a scan looks worse " +
      "for no reason, check what you ate the night before it.",
  },
  {
    id: "retinoid",
    label: "Retinoid",
    moves: "Texture, fine lines, acne, pigment",
    horizon: "months",
    evidence: "strong",
    metric: "Unevenness, erythema",
    habit: "retinoid",
    note:
      "Expect it to look WORSE for the first few weeks — that is the purge, " +
      "and the erythema index will rise before it falls. Quitting during it is " +
      "the most common way people waste a year.",
  },
  {
    id: "posture",
    label: "Posture and neck carriage",
    moves: "How the jaw and neck present to a camera",
    horizon: "weeks",
    evidence: "moderate",
    metric: "CVA from a profile capture",
    habit: "posture",
    note:
      "Changes how the skull is AIMED, not its shape. That is worth training " +
      "and is a different claim from the one usually made for it.",
  },
  {
    id: "neck",
    label: "Direct neck training",
    moves: "Neck circumference",
    horizon: "months",
    evidence: "moderate",
    metric: "Neck measurement in Body",
    note:
      "The neck is muscle and hypertrophies like any other. One of the few " +
      "genuinely trainable structures above the shoulders.",
  },
  {
    id: "cleanse",
    label: "Cleansing and moisturiser",
    moves: "Barrier, shine, day-to-day irritation",
    horizon: "weeks",
    evidence: "moderate",
    metric: "Shine, erythema",
    habit: "skincare",
    note: "Unglamorous, cheap, and the base everything else sits on.",
  },
  {
    id: "hydration",
    label: "Water",
    moves: "Very little, directly",
    horizon: "days",
    evidence: "weak",
    metric: "Puffiness ratio",
    note:
      "Being properly dehydrated shows. Drinking beyond adequate does nothing " +
      "for skin, whatever the volume of advice to the contrary.",
  },
  {
    id: "oral",
    label: "Brushing, flossing, scraping",
    moves: "Gum health, breath, stain",
    horizon: "weeks",
    evidence: "strong",
    metric: null,
    habit: "oral",
    note:
      "Excellent evidence for health, and gum recession is genuinely visible. " +
      "The app cannot measure any of it from a face photograph.",
  },
  {
    id: "whitening",
    label: "Whitening",
    moves: "Tooth shade",
    horizon: "weeks",
    evidence: "moderate",
    metric: null,
    note: "Real and shallow. Works, does what it says, changes nothing else.",
  },
  {
    id: "mewing",
    label: "Mewing, chewing, hard food",
    moves: "Nothing skeletal in an adult",
    horizon: "never",
    evidence: "none",
    metric: null,
    note:
      "Masseter hypertrophy from heavy chewing is real and slightly widens the " +
      "lower face. Jaw ANGLE, ramus length and chin projection are bone and are " +
      "finished growing. This is listed to be refused, not followed.",
  },
];

/** Levers that a measurement in this app can actually verify. */
export function measurableLevers(): Lever[] {
  return LEVERS.filter((l) => l.metric != null && l.horizon !== "never");
}

/** Levers the app should refuse to sell, kept visible rather than hidden. */
export function refusedLevers(): Lever[] {
  return LEVERS.filter((l) => l.evidence === "none" || l.horizon === "never");
}

/**
 * The habits that drive the levers, ready to seed into the habit tracker.
 *
 * Deliberately few. A face routine with eleven steps is one nobody keeps, and
 * the evidence thins out fast after the first four.
 */
export const LOOKS_HABITS: { id: string; name: string; color: string; why: string }[] = [
  { id: "sunscreen", name: "Sunscreen", color: "#f5c518", why: "The best long-term lever there is." },
  { id: "skincare", name: "Cleanse & moisturise", color: "#4cc9f0", why: "The base the rest sits on." },
  { id: "retinoid", name: "Retinoid", color: "#b388ff", why: "Texture and pigment, over months." },
  { id: "oral", name: "Brush & floss", color: "#a3e635", why: "Gums recede visibly and permanently." },
  { id: "posture", name: "Posture set", color: "#fb923c", why: "Changes how the jaw meets a camera." },
];

/** How long before a lever's own measurement could show anything. */
export const HORIZON_DAYS: Record<Horizon, number> = {
  days: 3,
  weeks: 21,
  months: 90,
  years: 730,
  never: Number.POSITIVE_INFINITY,
};

/**
 * Whether it is too early to judge a lever.
 *
 * The single most common way people give up on something that was working:
 * checking at three weeks for a change that takes three months.
 */
export function tooEarly(lever: Lever, daysRunning: number): boolean {
  return daysRunning < HORIZON_DAYS[lever.horizon];
}
