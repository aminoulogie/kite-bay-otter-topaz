/**
 * Eating on a timeline instead of all at 7pm.
 *
 * A day's calories are split across set eating times, each with a share. That
 * gives two numbers worth knowing at any moment: how much should be in by now,
 * and how big the next meal has to be. The second one is the fix — anything
 * missed is spread over the meals still left rather than piling up into the
 * evening, so falling behind at lunch means a bigger snack and a bigger dinner,
 * not 2,500 kcal after dark.
 */

export interface MealTime {
  label: string;
  /** "HH:MM", local time. */
  time: string;
  /** Percent of the day's calories. Shares are normalised, so they need not add to 100. */
  share: number;
}

export const DEFAULT_MEAL_TIMES: MealTime[] = [
  { label: "Breakfast", time: "08:30", share: 25 },
  { label: "Lunch", time: "12:30", share: 25 },
  { label: "Snack", time: "16:00", share: 15 },
  { label: "Dinner", time: "19:30", share: 25 },
  { label: "Evening", time: "21:30", share: 10 },
];

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h! : 0) * 60 + (Number.isFinite(m) ? m! : 0);
}

/** Valid times only, in the order they happen. */
export function cleanTimes(times: MealTime[] | undefined): MealTime[] {
  const list = (times && times.length ? times : DEFAULT_MEAL_TIMES)
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t.time) && t.share > 0)
    .slice()
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  return list.length ? list : DEFAULT_MEAL_TIMES;
}

export interface MealSlot {
  label: string;
  time: string;
  /** What this meal is worth on the plan, before any catching up. */
  planned: number;
  /** What it should be now, with anything missed spread over what is left. */
  target: number;
  /** Protein for the same meal, on the same rule. */
  protein: number;
  past: boolean;
}

export interface Pace {
  slots: MealSlot[];
  /** What should be eaten by now on the plan. */
  due: number;
  /** Positive when behind, negative when ahead. */
  behind: number;
  /** The first meal still to come today, if any. */
  next: MealSlot | null;
  left: number;
}

/**
 * Where the day stands at `nowMin` minutes after midnight.
 *
 * A meal counts as "due" from its time onward. The meals still to come share
 * whatever is left of the goal in proportion to their own shares — which is
 * the plan exactly when you are on track, and the catch-up when you are not.
 */
export function pace(
  times: MealTime[] | undefined,
  nowMin: number,
  goal: { cals: number; protein: number },
  eaten: { cals: number; protein: number },
): Pace {
  const list = cleanTimes(times);
  const total = list.reduce((a, t) => a + t.share, 0);
  const upcoming = list.filter((t) => minutesOf(t.time) > nowMin);
  const upShare = upcoming.reduce((a, t) => a + t.share, 0);
  const leftCals = Math.max(0, goal.cals - eaten.cals);
  const leftProtein = Math.max(0, goal.protein - eaten.protein);

  let due = 0;
  const slots: MealSlot[] = list.map((t) => {
    const past = minutesOf(t.time) <= nowMin;
    const planned = Math.round((goal.cals * t.share) / total);
    if (past) due += planned;
    const part = past || upShare <= 0 ? 0 : t.share / upShare;
    return {
      label: t.label,
      time: t.time,
      planned,
      target: past ? planned : Math.round(leftCals * part),
      protein: past ? Math.round((goal.protein * t.share) / total) : Math.round(leftProtein * part),
      past,
    };
  });

  return {
    slots,
    due,
    behind: Math.round(due - eaten.cals),
    next: slots.find((s) => !s.past) ?? null,
    left: Math.round(leftCals),
  };
}

export interface Reminder {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  title: string;
  body: string;
}

function at(day: Date, time: string): Date {
  const d = new Date(day);
  const m = minutesOf(time);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The next week of meal reminders.
 *
 * Today's carry the live numbers — what each meal has to be now, after what
 * has been logged — and skip entirely once the goal is met. Later days carry
 * the plan, and are rewritten with live numbers when that day comes and the
 * app is opened.
 */
export function reminders(
  times: MealTime[] | undefined,
  now: Date,
  goal: { cals: number; protein: number },
  eaten: { cals: number; protein: number },
  days = 7,
): Reminder[] {
  const out: Reminder[] = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = pace(times, nowMin, goal, eaten);
  for (const s of today.slots) {
    if (s.past || s.target < 50) continue;
    const behind = today.behind > 150 ? ` You're ${fmt(today.behind)} kcal behind, so this one's bigger.` : "";
    out.push({
      id: `0-${s.time}`,
      at: at(now, s.time).getTime(),
      title: `${s.label} time 🍽️`,
      body: `Aim for about ${fmt(s.target)} kcal and ${s.protein} g protein.${behind}`,
    });
  }
  const plan = pace(times, -1, goal, { cals: 0, protein: 0 });
  for (let d = 1; d < days; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    for (const s of plan.slots) {
      out.push({
        id: `${d}-${s.time}`,
        at: at(day, s.time).getTime(),
        title: `${s.label} time 🍽️`,
        body: `Aim for about ${fmt(s.target)} kcal and ${s.protein} g protein.`,
      });
    }
  }
  return out;
}
