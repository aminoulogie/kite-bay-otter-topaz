import { useMemo, useState } from "react";
import { Check, Moon, Pill, Repeat, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { recentFoods } from "@/lib/food-recents";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The gaps in today, fixed here rather than four tabs away.
 *
 * "Still open" listed what was missing and then sent you somewhere else to
 * fill it in. Four taps and a lost train of thought for a number you already
 * had in your head — which is exactly how a day ends up half-logged, and a
 * half-logged day is what makes every estimate in the app worse.
 *
 * So each row does the thing. Nothing here opens another screen unless the
 * thing genuinely cannot be done in one tap, and a row disappears the moment
 * its gap is filled: a card that still lists a job you have done is a card
 * people stop reading.
 */
export function LogTheGap() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const habits = useSoma((s) => s.habits);
  const live = useSoma((s) => s.live);
  const activeDate = useSoma((s) => s.activeDate);
  const logSleep = useSoma((s) => s.logSleep);
  const addCreatine = useSoma((s) => s.addCreatine);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const addFood = useSoma((s) => s.addFood);
  const repeatSession = useSoma((s) => s.repeatSession);
  const setTab = useSoma((s) => s.setTab);

  const today = getLocalDateKey(new Date());
  const date = activeDate || today;
  const day = nutrition[date];

  const [sleepHours, setSleepHours] = useState<string>("");
  const [openFood, setOpenFood] = useState(false);

  const recents = useMemo(() => recentFoods(nutrition, date, 8), [nutrition, date]);

  /** Yesterday's session, for the one-tap repeat. */
  const yesterday = useMemo(() => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const key = getLocalDateKey(d);
    const s = history[key];
    return s?.exercises?.length ? { key, session: s } : null;
  }, [history, date]);

  const needSleep = day?.sleep?.hours == null;
  const needFood = !day?.items?.length;
  const needCreatine = !(day?.creatine ?? 0);
  const openHabits = habits.filter((h) => h.history?.[date] !== true);
  const needSession = !history[date] && live.exercises.length === 0;

  const anything =
    needSleep || needFood || needCreatine || openHabits.length > 0 || (needSession && !!yesterday);
  if (!anything) return null;

  return (
    <Card>
      <CardTitle>Log the gap</CardTitle>

      {needSleep && (
        <Row icon={Moon} label="Sleep">
          <div className="flex items-center gap-1.5">
            <DecimalInput
              value={sleepHours}
              onValueChange={(_, raw) => setSleepHours(raw)}
              placeholder="7.5"
              aria-label="Hours slept"
              className="h-9 w-20 text-center"
            />
            <span className="text-xs text-faint">h</span>
            <Act
              disabled={!Number(sleepHours)}
              onClick={() => {
                const h = Number(sleepHours);
                if (!h) return;
                // Quality is left unrated rather than assumed: the readiness
                // blend weights hours twice as heavily as quality, and a
                // fabricated 3 would be a number nobody entered.
                logSleep(h);
                setSleepHours("");
                toast.success(`${h}h logged`);
              }}
            >
              Log
            </Act>
          </div>
        </Row>
      )}

      {needCreatine && (
        <Row icon={Pill} label="Creatine">
          <Act
            onClick={() => {
              addCreatine(5);
              toast.success("5g creatine");
            }}
          >
            +5g
          </Act>
        </Row>
      )}

      {needFood && (
        <Row icon={Utensils} label="Nothing eaten logged">
          <Act onClick={() => setOpenFood((o) => !o)}>{openFood ? "Hide" : "Recent"}</Act>
        </Row>
      )}

      {/* Expanded by default once asked for, because the whole point is to
          skip the trip to the Nutrition tab — a second tap to reveal the
          chips would put the trip back. */}
      {needFood && openFood && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {recents.length === 0 ? (
            <button
              type="button"
              onClick={() => setTab("nutrition")}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold"
            >
              Nothing logged yet — open Nutrition
            </button>
          ) : (
            recents.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => {
                  addFood(r.item);
                  toast.success(`${r.item.name} · ${Math.round(r.item.cals)} kcal`);
                }}
                className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold"
              >
                {r.item.name}
                <span className="ml-1.5 text-faint">{Math.round(r.item.cals)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {openHabits.length > 0 && (
        <Row icon={Check} label={`${openHabits.length} habit${openHabits.length === 1 ? "" : "s"} left`}>
          <div className="flex flex-wrap justify-end gap-1.5">
            {openHabits.slice(0, 4).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  toggleHabit(h.id, date);
                  toast.success(h.name);
                }}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1.5 text-[0.68rem] font-bold"
              >
                {h.name}
              </button>
            ))}
          </div>
        </Row>
      )}

      {needSession && yesterday && (
        <Row icon={Repeat} label={`Repeat ${yesterday.session.split}`}>
          <Act
            onClick={() => {
              // Names only. The sets are rebuilt from what each lift has done
              // historically, autoregulated — copying yesterday's weights
              // would hand back the numbers instead of the next ones.
              if (repeatSession(yesterday.key)) {
                setTab("workout");
                toast.success(`${yesterday.session.split} loaded`);
              } else {
                toast.error("Finish or clear the session you have open first");
              }
            }}
          >
            Load
          </Act>
        </Row>
      )}
    </Card>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: typeof Moon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 last:mb-0">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-faint" />
        <span className="truncate text-sm font-bold">{label}</span>
      </span>
      {children}
    </div>
  );
}

function Act({
  children, onClick, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 shrink-0 rounded-xl px-3 text-xs font-extrabold",
        disabled ? "bg-surface-3 text-faint" : "bg-accent text-accent-ink",
      )}
    >
      {children}
    </button>
  );
}
