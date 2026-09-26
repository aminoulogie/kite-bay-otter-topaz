import { useMemo } from "react";
import { Check, Droplet, Dumbbell, Sparkles } from "lucide-react";
import { Glance, isGlance } from "@/components/Glance";
import { Card, CardTitle } from "@/components/ui/card";
import { CoachBrief } from "@/components/CoachBrief";
import { MACRO_COLOR, type MacroKey } from "@/components/MacroStrip";
import { ProjectsCard } from "@/components/ProjectsCard";
import { TodoCard } from "@/components/TodoCard";
import { LogTheGap } from "@/components/LogTheGap";
import { HabitRings } from "@/components/HabitRings";
import { ActivityRings } from "@/components/ActivityRings";
import { WidgetGrid, useWidgetSize } from "@/components/WidgetGrid";
import { hasDetailRoom, hasFullRoom } from "@/lib/dashboard-layout";
import { bodyweightOn, buildDayInputs, previousSameSplit } from "@/lib/day-inputs";
import { ratingTone } from "@/lib/stimulus";
import { scoreDay } from "@/lib/day-score";
import { MIN_PAIRS, shortfall, strongestFinding, type Series } from "@/lib/correlate";
import { totalWaterMl } from "@/lib/hydration";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The middle tab, and where the app opens.
 *
 * Deliberately reads rather than writes. Every number here already exists on
 * another tab; the point of gathering them is that no single tab answers "how
 * is today going" — you had to visit four to find out, which meant nobody did.
 *
 * It is also the screen the other domains will hang off as they arrive, so it
 * shows what is TRACKED rather than what is good: a blank protein figure means
 * nothing was logged, and saying so is more useful than a zero that reads like
 * a failure.
 */
/**
 * The score, at whatever size it was given.
 *
 * The one card on Home where the three sizes mean genuinely different things:
 * SMALL is the number, MEDIUM is the number with where it came from, LARGE
 * adds the rows that scored nothing. Drawing the breakdown at small and
 * letting the grid fade it off the bottom edge would show four rows and cut
 * the fifth in half, which looks like a rendering bug rather than a summary.
 */
function ScoreCard({
  score, lines,
}: {
  score: number;
  lines: { id: string; label: string; earned: number | null; possible: number }[];
}) {
  const size = useWidgetSize();
  const shown = lines.filter((l) => l.earned != null);
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Today's score",
          short: "Score",
          emptyShort: "No data",
          value: shown.length ? String(Math.round(score)) : null,
          valueClass: ratingTone(score),
          sub: shown.length ? `out of 100 · ${shown.length} counted` : null,
          progress: shown.length ? score / 100 : null,
          color: score >= 75 ? "#30d158" : score >= 50 ? "#ffd60a" : "#ff9f0a",
          lines: shown.map((l) => ({ text: l.label, value: `${Math.round(l.earned ?? 0)}/${l.possible}` })),
          empty: "Nothing tracked yet",
        }}
      />
    );
  }
  return (
    <Card>
      <CardTitle>Today</CardTitle>
      {/* Wraps rather than overflowing: this card can be dragged to a quarter
          of a phone, and a number beside a caption has a wide min-content. */}
      <div className="flex flex-wrap items-end gap-x-3">
        <div
          className={cn(
            "font-display font-extrabold tabular",
            hasDetailRoom(size) ? "text-5xl" : "text-4xl",
            ratingTone(score),
          )}
        >
          {Math.round(score)}
        </div>
        <div className="min-w-0 pb-1.5 text-xs text-muted">
          out of 100
          {hasDetailRoom(size) && (
            <div className="text-[0.65rem] text-faint">of what you tracked</div>
          )}
        </div>
      </div>
      {hasDetailRoom(size) && (
        <div className="mt-3 space-y-1">
          {shown.slice(0, hasFullRoom(size) ? 12 : 5).map((l) => (
            <div key={l.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted">{l.label}</span>
              <span className="shrink-0 tabular font-bold">
                {Math.round(l.earned ?? 0)}
                <span className="text-faint">/{l.possible}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {!hasDetailRoom(size) && shown.length > 0 && (
        <div className="mt-2 text-[0.62rem] font-bold uppercase tracking-wide text-faint">
          {shown.length} things counted
        </div>
      )}
    </Card>
  );
}

export function DashboardView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const setTab = useSoma((s) => s.setTab);
  const live = useSoma((s) => s.live);
  const ledger = useSoma((s) => s.ledger);
  const mind = useSoma((s) => s.mind);
  const hunger = useSoma((s) => s.hunger);
  const settings = useSoma((s) => s.settings);

  const today = getLocalDateKey(new Date());
  const date = activeDate || today;

  const { score, lines } = useMemo(() => {
    return scoreDay(
      buildDayInputs({
        date,
        session: history[date] ?? null,
        previous: previousSameSplit(history, date),
        nutrition,
        bodyweightKg: bodyweightOn(nutrition, date),
        hunger,
        phase: settings.phase,
      }),
    );
  }, [history, nutrition, date, hunger, settings.phase]);

  /**
   * The five things worth comparing, each as a date-keyed series.
   *
   * A date absent means not logged, never zero — see lib/correlate.ts, where
   * pairing against a missing figure is the specific mistake being avoided.
   */
  const finding = useMemo(() => {
    const sessionScore = new Map<string, number>();
    for (const [d, sess] of Object.entries(history)) {
      const totals = sess?.totalVol;
      if (typeof totals === "number" && totals > 0) sessionScore.set(d, totals);
    }

    const sleep = new Map<string, number>();
    const calories = new Map<string, number>();
    for (const [d, nd] of Object.entries(nutrition)) {
      if (nd?.sleep?.hours != null) sleep.set(d, nd.sleep.hours);
      const kcal = (nd?.items ?? []).reduce((a, i) => a + i.cals, 0);
      if (kcal > 0) calories.set(d, kcal);
    }

    const spend = new Map<string, number>();
    for (const e of ledger) {
      if (e.kind === "income") continue;
      spend.set(e.date, (spend.get(e.date) ?? 0) + Math.abs(Number(e.amount) || 0));
    }

    const reading = new Map<string, number>();
    for (const m of mind) reading.set(m.date, (reading.get(m.date) ?? 0) + 1);

    const series: Series[] = [
      { label: "Training volume", values: sessionScore },
      { label: "Sleep", values: sleep },
      { label: "Calories", values: calories },
      { label: "Spending", values: spend },
      { label: "Reading", values: reading },
    ];
    return { found: strongestFinding(series), short: shortfall(series) };
  }, [history, nutrition, ledger, mind]);

  const day = nutrition[date];
  const eaten = day?.items ?? [];
  // Confirmed food only — planned items live in their own array and are
  // counted by nothing, which is what makes a green tick here mean something.
  const macros = eaten.reduce(
    (a, i) => ({
      cals: a.cals + (i.cals || 0),
      p: a.p + (i.p || 0),
      c: a.c + (i.c || 0),
      f: a.f + (i.f || 0),
    }),
    { cals: 0, p: 0, c: 0, f: 0 },
  );
  const goals = day?.goals;
  const water = totalWaterMl(day);
  const session = history[date];
  const waterGoal = goals?.water || 3500;
  // The last seven days, oldest first, for the bars the big sizes draw.
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - (6 - i));
    return { key: getLocalDateKey(d), day: d.toLocaleDateString(undefined, { weekday: "narrow" }) };
  });
  const weekOf = (field: "cals" | "p" | "c" | "f") =>
    days7.map(({ key, day }) => ({
      day,
      value: (nutrition[key]?.items ?? []).reduce((a, i) => a + (Number(i[field]) || 0), 0),
    }));
  const topOf = (field: "cals" | "p" | "c" | "f") =>
    eaten
      .map((i) => ({ name: i.name, amount: Number(i[field]) || 0 }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  const waterWeek = days7.map(({ key, day }) => ({ day, value: totalWaterMl(nutrition[key]) / 1000 }));
  const lifts: string[] = (session?.exercises ?? (session ? [] : live.exercises))
    .map((e: { name?: string }) => e?.name ?? "")
    .filter(Boolean);

  // Each widget carries the id the layout arranges as its KEY. The page is
  // then just its widgets, in whatever order the user put them.
  return (
    <WidgetGrid tab="dashboard">
      {/* Not wrapped in a div: the grid stretches a widget's own root to fill
          the box it was given, and a bare wrapper would stretch instead of the
          card, leaving the card floating in a taller empty cell. */}
      <CoachBrief key="brief" horizon="today" />
      <ActivityRings key="rings" />
      <ScoreCard key="score" score={score} lines={lines} />

      {/* The ticked ones are done — that is the whole point of a tile, and it
          is why only CONFIRMED food counts towards them. */}
      <MacroTile key="cals" macro="cals" week={weekOf("cals")} top={topOf("cals")} label="Calories" unit="kcal"
                 value={macros.cals} target={goals?.cals} onClick={() => setTab("nutrition")} />
      <MacroTile key="protein" macro="p" week={weekOf("p")} top={topOf("p")} label="Protein" unit="g"
                 value={macros.p} target={goals?.protein} onClick={() => setTab("nutrition")} />
      <MacroTile key="carbs" macro="c" week={weekOf("c")} top={topOf("c")} label="Carbs" unit="g"
                 value={macros.c} target={goals?.carbs} onClick={() => setTab("nutrition")} />
      <MacroTile key="fat" macro="f" week={weekOf("f")} top={topOf("f")} label="Fat" unit="g"
                 value={macros.f} target={goals?.fat} onClick={() => setTab("nutrition")} />
      <Tile key="water" icon={Droplet} color="#19e3e3" label="Water" value={water ? (water / 1000).toFixed(1) : null} unit="L"
            sub={`of ${(waterGoal / 1000).toFixed(1)} L`} progress={water / waterGoal} empty="No water logged"
            week={waterWeek} goal={waterGoal / 1000}
            onClick={() => setTab("nutrition")} />
      <Tile key="session" icon={Dumbbell} color="#bf5af2" label="Session"
            value={lifts.length ? String(lifts.length) : null}
            unit={lifts.length === 1 ? "lift" : "lifts"}
            sub={session ? "done today" : lifts.length ? "in progress" : null}
            lines={lifts.map((n) => ({ text: n }))}
            empty="No session yet"
            onClick={() => setTab("workout")} />
      <HabitRings key="habits" />

      <TodoCard key="todos" />
      <ProjectsCard key="projects" />
      <LogTheGap key="gap" />
      <Correlate
        key="correlate"
        text={finding.found?.text ?? null}
        empty={
          finding.short > 0
            ? `Needs about ${finding.short} more days logged`
            : "Nothing has moved together yet"
        }
      >
      <Card>
        <CardTitle>Across everything</CardTitle>
        {finding.found ? (
          <>
            <p className="text-sm font-bold leading-snug">{finding.found.text}</p>
            <p className="mt-1 text-[0.68rem] leading-snug text-faint">
              Correlation {finding.found.r.toFixed(2)} over {finding.found.n} days where both
              were logged. Things moving together is not one causing the other — a bad week
              usually moves several of these at once.
            </p>
          </>
        ) : (
          <p className="text-xs leading-snug text-faint">
            {finding.short > 0
              ? `Nothing to say yet. This needs ${MIN_PAIRS} days with two of these logged together — about ${finding.short} more.`
              : "Nothing has moved together strongly enough to be worth a sentence."}
          </p>
        )}
      </Card>
      </Correlate>
    </WidgetGrid>
  );
}


function Tile({
  icon: Icon, label, value, unit, onClick, sub, progress, lines, empty, week, goal, color,
}: {
  color?: string;
  week?: { day: string; value: number }[];
  goal?: number;
  icon: typeof Droplet;
  label: string;
  value: string | null;
  unit: string;
  onClick: () => void;
  sub?: string | null;
  progress?: number | null;
  lines?: { text: string }[];
  empty: string;
}) {
  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{ label, icon: Icon, color, value, unit, sub, progress, lines, empty, onOpen: onClick }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4 text-left active:bg-surface-2"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="font-display text-3xl font-extrabold tabular">
        {value ?? "—"}
        <span className="ml-1 text-xs font-bold text-faint">{unit}</span>
      </div>
      {sub && <div className="mt-1 text-[0.7rem] text-faint">{sub}</div>}
      {progress != null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </div>
      )}
      {lines && lines.length > 0 && (
        <ul className="mt-3 space-y-1">
          {lines.map((l, i) => (
            <li key={i} className="truncate text-xs text-muted">{l.text}</li>
          ))}
        </ul>
      )}
      {week && <WeekBars week={week} target={goal} color={color ?? "var(--color-accent)"} />}
    </button>
  );
}

/**
 * One quantity against its target, ticked when it is met.
 *
 * The tick is the point. A number on its own — "142g" — makes you remember
 * what you were aiming for and do the subtraction; that is a small tax paid
 * every time you look at the screen. Green means done and nothing more needs
 * reading.
 *
 * Over target is shown in the macro's own colour rather than as a failure.
 * 190g of protein against a 180g target is not a mistake, and colouring it red
 * would be the app inventing a rule the user never set. Calories are the one
 * that says so, because a surplus or deficit is the thing being managed.
 */
function MacroTile({
  macro, label, unit, value, target, onClick, week, top,
}: {
  week: { day: string; value: number }[];
  top: { name: string; amount: number }[];
  macro: MacroKey;
  label: string;
  unit: string;
  value: number;
  target?: number;
  onClick: () => void;
}) {
  const logged = value > 0;
  const has = typeof target === "number" && target > 0;
  const pct = has ? Math.min(100, (value / target!) * 100) : 0;
  const hit = has && value >= target! * 0.95;
  const over = has && macro === "cals" && value > target! * 1.1;
  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label,
          color: MACRO_COLOR[macro],
          value: logged ? String(Math.round(value)) : null,
          unit,
          sub: has ? (logged ? `of ${Math.round(target!)} · ${Math.max(0, Math.round(target! - value))} to go` : `goal ${Math.round(target!)}`) : null,
          progress: has ? value / target! : null,
          done: hit,
          empty: "Nothing logged",
          onOpen: onClick,
        }}
      />
    );
  }

  const big = hasFullRoom(size);
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4 text-left active:bg-surface-2"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-faint">
        <span aria-hidden className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ background: MACRO_COLOR[macro] }} />
        {label}
        {hit && (
          <span
            className={cn(
              "ml-auto grid size-4 shrink-0 place-items-center rounded-full",
              over ? "bg-warn text-black" : "bg-accent text-accent-ink",
            )}
            aria-label={over ? `${label} over target` : `${label} target met`}
          >
            <Check className="size-3" strokeWidth={3.2} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3">
        <div className="font-display text-4xl font-extrabold tabular">
          {logged ? Math.round(value) : "—"}
          <span className="ml-1 text-sm font-bold text-faint">{unit}</span>
        </div>
        {has && (
          <div className="text-xs tabular text-faint">
            of {Math.round(target!)}
            {logged && ` · ${Math.max(0, Math.round(target! - value))} to go`}
          </div>
        )}
      </div>
      {has && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: MACRO_COLOR[macro] }} />
        </div>
      )}
      <WeekBars week={week} target={target} color={MACRO_COLOR[macro]} />
      {big && <TopFoods items={top} unit={unit} />}
    </button>
  );
}

/** "Across everything": the finding as a sentence, or how far off one is. */
function Correlate({ text, empty, children }: { text: string | null; empty: string; children: React.ReactNode }) {
  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{ label: "Across everything", short: "Links", emptyShort: "Not yet", icon: Sparkles, lines: text ? [{ text }] : [], empty }}
      />
    );
  }
  return <>{children}</>;
}

/** Seven days of one figure as bars, today last and brightest, with the target as a line. */
function WeekBars({
  week, target, color,
}: {
  week: { day: string; value: number }[];
  target?: number;
  color: string;
}) {
  const max = Math.max(1, target ?? 0, ...week.map((w) => w.value));
  return (
    <div className="mt-auto pt-3">
      <div className="relative flex h-14 items-end gap-1.5">
        {target != null && target > 0 && (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-fg/25"
            style={{ bottom: `${(target / max) * 100}%` }}
          />
        )}
        {week.map((w, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: `${Math.max(w.value > 0 ? 4 : 0, (w.value / max) * 100)}%`,
                background: color,
                opacity: i === week.length - 1 ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {week.map((w, i) => (
          <div key={i} className="flex-1 text-center text-[0.55rem] font-bold text-faint">{w.day}</div>
        ))}
      </div>
    </div>
  );
}

/** Where today's figure came from: the biggest contributors. */
function TopFoods({ items, unit }: { items: { name: string; amount: number }[]; unit: string }) {
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1 text-[0.58rem] font-bold uppercase tracking-wider text-faint">Most of it from</div>
      {items.length === 0 ? (
        <p className="text-xs text-faint">Nothing logged today.</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted">{it.name}</span>
              <span className="shrink-0 tabular font-bold">
                {Math.round(it.amount)}
                <span className="text-faint"> {unit}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
