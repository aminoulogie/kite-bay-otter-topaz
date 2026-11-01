/**
 * How a set was done: grip, lifting aids, and the things that make a lift
 * easier than it looks on paper.
 *
 * Recorded per set (a lifter who straps up for the last two sets of rows did
 * two different things), picked in the Setup sheet that replaced the one-tap
 * grip button.
 *
 * ## What each part is for
 *
 * - **Grip** (width + hand position) describes the movement. It changes which
 *   muscles do the work, not how much easier the lift is, so it is shown and
 *   exported but does not split records — most named variations ("Close Grip
 *   Bench", "Wide Grip Pulldown") are separate exercises already.
 *
 * - **Straps** take grip out of the lift. They are not a penalty: the
 *   research on pulls is that straps let the lifter move more (a deadlift study
 *   found a heavier 1RM and more force with straps; pull-ups reached ~17% more
 *   reps to failure) and none of it found the back doing less. What they do
 *   change is the number on the bar, so a strapped set is compared only with
 *   strapped sets — a straps PR is not a bare-hands PR. On a strapped set, grip
 *   cannot be what stopped it, so a back failure is a back failure.
 *
 * - **Belt** is safety gear, recommended on lifts that load the lower back
 *   under a bent or upright spine (bent-over row, deadlift, squat, standing
 *   press). It is never penalised and does not split records — wearing it as
 *   advised must not reset your history.
 *
 * - **Cheats** (back arch on presses, momentum on curls/rows/raises) make the
 *   lift easier by shortening the range or moving load off the target. They:
 *     1. get their own records (an arched bench PR is not a strict one),
 *     2. lower the Technique share of the set score (CHEAT_FORM),
 *     3. stop the set counting as a true failure of the target, and cap the
 *        1-5 failure number at 3, as "form broke" already does — so the plan
 *        keeps asking for strict reps before more weight.
 */

export type GripWidth = "close" | "narrow" | "medium" | "wide";
export type GripHand = "pronated" | "neutral" | "supinated" | "mixed";
export type Aid = "straps" | "belt";
export type Cheat = "arch" | "momentum";

export interface Grip {
  width?: GripWidth;
  orientation?: GripHand;
}

export interface SetSetup {
  grip?: Grip;
  /** Absent or empty: bare hands, no gear. */
  aids?: Aid[];
  /** Absent or empty: strict. */
  cheats?: Cheat[];
}

// ------------------------------------------------------------------ labels --

export const GRIP_WIDTHS: { id: GripWidth; label: string; short: string }[] = [
  { id: "close", label: "Close", short: "C" },
  { id: "narrow", label: "Narrow", short: "N" },
  { id: "medium", label: "Medium", short: "M" },
  { id: "wide", label: "Wide", short: "W" },
];

export const GRIP_HANDS: { id: GripHand; label: string; hint: string; short: string }[] = [
  { id: "pronated", label: "Overhand", hint: "palms down / away", short: "Ov" },
  { id: "neutral", label: "Neutral", hint: "palms facing", short: "Neu" },
  { id: "supinated", label: "Underhand", hint: "palms up / toward you", short: "Un" },
  { id: "mixed", label: "Mixed", hint: "one over, one under", short: "Mix" },
];

export const AIDS: { id: Aid; label: string; hint: string; short: string }[] = [
  { id: "straps", label: "Straps / hooks", hint: "grip taken out of the lift", short: "Str" },
  { id: "belt", label: "Belt", hint: "braces the lower back", short: "Blt" },
];

export const CHEATS: { id: Cheat; label: string; hint: string; short: string; record: string }[] = [
  { id: "arch", label: "Back arch", hint: "big arch on a press: shorter range", short: "Arch", record: "Arched" },
  { id: "momentum", label: "Momentum / swing", hint: "body swing, jerk or kip moved the weight", short: "Swg", record: "Swung" },
];

// ------------------------------------------------------- which lift gets what --

export interface SetupOptions {
  width: boolean;
  hand: boolean;
  /** Mixed grip is a deadlift-family thing; elsewhere it is noise. */
  mixed: boolean;
  straps: boolean;
  belt: boolean;
  /** Belt advised for safety on this lift. */
  beltRecommended: boolean;
  arch: boolean;
  momentum: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[-_/(),.]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * The options that make sense for a lift, read from its name.
 *
 * By name rather than by library flags because most logged lifts come from an
 * import or a custom entry ("Barbell Bent Over Row", "T-Bar Row") and carry
 * none of the library's fields.
 */
export function setupOptions(ex: { name: string; muscle?: string }): SetupOptions {
  const n = norm(ex.name);
  const has = (re: RegExp) => re.test(n);

  const deadliftish = has(/\b(dead ?lifts?|rdls?|romanian|rack pulls?|good ?mornings?)\b/);
  const singleLeg = has(/\b(single leg|one leg|b stance|kickstand)\b/);
  const row = has(/\brows?\b/);
  const upright = has(/\bupright rows?\b/);
  const supportedRow = has(/\b(chest supported|seal|machine|inverted)\b/);
  const pulldown = has(/\bpull ?downs?\b/);
  const pullup = has(/\b(pull ?ups?|chin ?ups?)\b/);
  const shrug = has(/\bshrugs?\b/);
  const facePull = has(/\bface pulls?\b/);
  const straightArm = has(/\b(straight arm|pullovers?)\b/);
  const legCurl = has(/\b(leg|hamstring|nordic) curls?\b/);
  const curl = has(/\bcurls?\b/) && !legCurl;
  const wristCurl = has(/\bwrist curls?\b/);
  const raise = has(/\braises?\b/) && !has(/\b(calf|knee|leg|hip) raises?\b/);
  const rearFly = has(/\b(rear delt|reverse)\b/) && has(/\b(fl(y|ies|yes|ye)|pec deck)\b/);
  const pushdown = has(/\bpush ?downs?\b/);
  const tricepsBar = pushdown || has(/\b(skull ?crushers?|lying .*triceps? extensions?|french press)\b/);
  const dipOrPushup = has(/\b(dips?|push ?ups?)\b/);
  const press =
    has(/\b(bench|press|presses|dips?|push ?ups?)\b/) &&
    !has(/\b(leg|calf|pallof) press\b/) &&
    !has(/\bpress around\b/);
  const squat = has(/\bsquats?\b/);
  const heavySquat = squat && !has(/\b(split|bulgarian|goblet|pistol|sissy|hack|pendulum|belt)\b/);
  const legOther = has(/\b(lunges?|step ?ups?|hip thrusts?|leg press|hack)\b/);
  const oneHand = has(/\b(dumbbells?|db|kettlebells?|kb|single arm|one arm|unilateral)\b/);
  const standingPress = press && has(/\b(overhead press|ohp|military)\b/);

  const pull = deadliftish || row || pulldown || pullup || shrug || straightArm;
  const gripped = (pull || press || curl || tricepsBar) && !dipOrPushup && !wristCurl;

  const beltRecommended =
    (deadliftish && !singleLeg) ||
    heavySquat ||
    standingPress ||
    (row &&
      has(/\b(barbell|bent over|pendlay|t ?bar|yates)\b/) &&
      !supportedRow &&
      !upright &&
      !oneHand &&
      !has(/\b(cable|seated|meadows)\b/));

  return {
    width: gripped && !oneHand && !has(/\b(hammer|concentration)\b/),
    hand: gripped,
    mixed: deadliftish || (shrug && !oneHand),
    straps: (deadliftish || row || pulldown || pullup || shrug || has(/\bstraight arm\b/)) && !facePull,
    belt: beltRecommended || squat || legOther || shrug || (press && has(/\bstanding\b/)),
    beltRecommended,
    arch: press && !dipOrPushup,
    momentum:
      (curl && !wristCurl && !has(/\b(preacher|concentration|machine|spider|incline|bayesian)\b/)) ||
      raise ||
      (row && !supportedRow) ||
      pullup ||
      pulldown ||
      shrug ||
      facePull ||
      pushdown ||
      rearFly,
  };
}

/** Whether a lift offers anything to set up at all. */
export function hasSetup(o: SetupOptions): boolean {
  return o.width || o.hand || o.straps || o.belt || o.arch || o.momentum;
}

// ------------------------------------------------------------- records --

/**
 * Which record a set belongs to: "" for strict, bare hands; otherwise the
 * straps and cheats it used, sorted and joined ("arch", "straps",
 * "momentum+straps").
 *
 * Absent setup reads as "" — every set logged before this existed was, as far
 * as anyone recorded, done the normal way, and splitting it off would make
 * everyone's history vanish from their own records.
 */
export function setVariant(s: SetSetup | null | undefined): string {
  if (!s) return "";
  const parts = new Set<string>();
  for (const a of s.aids ?? []) if (a === "straps") parts.add(a);
  for (const c of s.cheats ?? []) if (c === "arch" || c === "momentum") parts.add(c);
  return [...parts].sort().join("+");
}

/** "Strict", "Straps", "Arched + straps" — a variant as words. */
export function variantLabel(v: string): string {
  if (!v) return "Strict";
  return v
    .split("+")
    .map((p, i) => {
      const word = p === "straps" ? "Straps" : (CHEATS.find((c) => c.id === p)?.record ?? p);
      return i === 0 ? word : word.toLowerCase();
    })
    .join(" + ");
}

/**
 * The record the next set of a live exercise is aiming at: the setup of its
 * latest set that has one recorded, else strict.
 */
export function liveVariant(sets: SetSetup[] | null | undefined): string {
  const list = sets ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.aids?.length || s.cheats?.length || s.grip) return setVariant(s);
  }
  return "";
}

/** Only the sets that belong to one record. */
export function setsOfVariant<T extends SetSetup>(sets: T[], variant: string): T[] {
  return sets.filter((s) => setVariant(s) === variant);
}

/** Every record a lift has sets in, strict first, then most used. */
export function loggedVariants(sets: SetSetup[]): string[] {
  const count = new Map<string, number>();
  for (const s of sets) {
    const v = setVariant(s);
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : b[1] - a[1]))
    .map(([v]) => v);
}

// -------------------------------------------------------------- scoring --

/**
 * What a cheat does to the Technique share of the set score (0-1, multiplied).
 *
 * Momentum costs more than an arch: a swing moves load off the target through
 * the hardest part of the rep, an arch shortens the range but keeps the chest
 * loaded. Both are multiplied into the Technique answer (or stand in for it
 * when Technique was not rated — a cheat is a technique observation).
 */
export const CHEAT_FORM: Record<Cheat, number> = {
  arch: 0.85,
  momentum: 0.7,
};

export function cheatFactor(cheats: Cheat[] | null | undefined): number {
  let f = 1;
  for (const c of new Set(cheats ?? [])) f *= CHEAT_FORM[c] ?? 1;
  return f;
}

export function isCheated(s: SetSetup | null | undefined): boolean {
  return (s?.cheats ?? []).some((c) => c === "arch" || c === "momentum");
}

// --------------------------------------------------------------- display --

/** Two short lines for the set row's Setup button: grip, then aids and cheats. */
export function setupCode(s: SetSetup | null | undefined): { grip: string; flags: string } {
  const g = s?.grip;
  const grip = [
    GRIP_WIDTHS.find((w) => w.id === g?.width)?.short,
    GRIP_HANDS.find((h) => h.id === g?.orientation)?.short,
  ]
    .filter(Boolean)
    .join("·");
  const flags = [
    ...(s?.aids ?? []).map((a) => AIDS.find((x) => x.id === a)?.short),
    ...(s?.cheats ?? []).map((c) => CHEATS.find((x) => x.id === c)?.short),
  ]
    .filter(Boolean)
    .join("·");
  return { grip, flags };
}

/** "Wide · overhand · straps · back arch" — the whole setup in words. */
export function setupSummary(s: SetSetup | null | undefined): string {
  const g = s?.grip;
  return [
    GRIP_WIDTHS.find((w) => w.id === g?.width)?.label,
    GRIP_HANDS.find((h) => h.id === g?.orientation)?.label.toLowerCase(),
    ...(s?.aids ?? []).map((a) => (a === "straps" ? "straps" : "belt")),
    ...(s?.cheats ?? []).map((c) => CHEATS.find((x) => x.id === c)?.label.toLowerCase()),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function hasRecordedSetup(s: SetSetup | null | undefined): boolean {
  return !!(s?.grip?.width || s?.grip?.orientation || s?.aids?.length || s?.cheats?.length);
}

/**
 * A setup patch made tidy: empty lists and an empty grip are removed rather
 * than stored, so "nothing recorded" stays absent instead of becoming [].
 */
export function cleanSetup(s: SetSetup): { grip: Grip | undefined; aids: Aid[] | undefined; cheats: Cheat[] | undefined } {
  const grip = s.grip && (s.grip.width || s.grip.orientation)
    ? { ...(s.grip.width ? { width: s.grip.width } : {}), ...(s.grip.orientation ? { orientation: s.grip.orientation } : {}) }
    : undefined;
  const aids = s.aids?.length ? [...new Set(s.aids)] : undefined;
  const cheats = s.cheats?.length ? [...new Set(s.cheats)] : undefined;
  return { grip, aids, cheats };
}
