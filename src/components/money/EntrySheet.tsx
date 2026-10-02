import { useEffect, useMemo, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseDecimal } from "@/components/ui/decimal-input";
import { MoneySheet, MoneyTile } from "@/components/money/money-ui";
import { captureImage, deletePhoto, getPhoto, savePhoto } from "@/lib/habit-photos";
import { CURRENCIES, MAIN_ID, accountsOf, categoriesOf, colorsOf } from "@/lib/money-model";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { LedgerEntry, MoneyCurrency } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Where receipt photos live: the habit photo store, under their own key. */
export const receiptKey = (entryId: string) => `receipt:${entryId}`;

/**
 * Add or edit a transaction, the way the mockup's Add Transaction screen
 * does it: a big amount, Expense or Income, then the details.
 */
export function EntrySheet({
  entry, defaultKind = "spend", onClose,
}: {
  /** Editing this one; absent means a new entry. */
  entry?: LedgerEntry;
  defaultKind?: "spend" | "income";
  onClose: () => void;
}) {
  const ledger = useSoma((s) => s.ledger);
  const settings = useSoma((s) => s.settings);
  const addLedger = useSoma((s) => s.addLedger);
  const updateLedger = useSoma((s) => s.updateLedger);
  const accounts = useMemo(() => accountsOf(settings), [settings]);
  const cats = useMemo(() => categoriesOf(settings, ledger), [settings, ledger]);
  const colors = colorsOf(settings);

  const [kind, setKind] = useState<"spend" | "income">(
    entry?.kind === "income" ? "income" : entry ? "spend" : defaultKind,
  );
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [accountId, setAccountId] = useState(entry?.accountId ?? MAIN_ID);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]!;
  const [currency, setCurrency] = useState<MoneyCurrency>(entry?.currency ?? account.currency);
  const [category, setCategory] = useState(
    entry?.category ?? (defaultKind === "income" ? "Salary" : "Food"),
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(entry?.date ?? getLocalDateKey(new Date()));
  /** A new photo picked here, not yet saved. */
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);

  // The receipt already on file, for an entry being edited.
  useEffect(() => {
    if (!entry?.photo || photo || dropPhoto) return;
    let url = "";
    let alive = true;
    void getPhoto(receiptKey(entry.id), entry.date).then((p) => {
      if (!alive || !p) return;
      url = URL.createObjectURL(p.thumb);
      setPreview(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, photo, dropPhoto]);

  const tone = kind === "income" ? colors.income : colors.expense;
  const shown = cats.filter((c) => c.kind === kind);

  const save = async () => {
    const value = parseDecimal(amount);
    if (value == null || value <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    const fields = {
      date,
      kind,
      amount: Math.abs(value),
      category,
      note: note.trim() || undefined,
      accountId: accountId === MAIN_ID ? undefined : accountId,
      currency: currency === "DZD" ? undefined : currency,
    };
    let id = entry?.id;
    if (entry) updateLedger(entry.id, fields);
    else {
      addLedger(fields);
      // addLedger mints the id; the newest entry with these fields is it.
      const made = useSoma.getState().ledger.at(-1);
      id = made?.id;
    }
    try {
      if (id && photo) {
        await savePhoto(receiptKey(id), date, photo);
        updateLedger(id, { photo: true });
      } else if (id && entry?.photo && dropPhoto) {
        await deletePhoto(receiptKey(id), entry.date);
        updateLedger(id, { photo: false });
      }
    } catch {
      toast.error("The receipt photo could not be saved.");
    }
    toast.success(entry ? "Saved" : kind === "income" ? "Income added" : "Expense added");
    onClose();
  };

  return (
    <MoneySheet title={entry ? "Edit transaction" : "Add transaction"} onClose={onClose}>
      {/* Expense / Income, red and green. */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
        {(["spend", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              if (!cats.some((c) => c.kind === k && c.name === category)) {
                setCategory(k === "income" ? "Salary" : "Food");
              }
            }}
            className="h-9 rounded-full text-sm font-bold transition-colors"
            style={kind === k ? { background: k === "income" ? colors.income : colors.expense, color: "#fff" } : undefined}
          >
            {k === "spend" ? "Expense" : "Income"}
          </button>
        ))}
      </div>

      {/* The amount, big, in the colour of what it is. */}
      <div className="mb-2 flex items-baseline justify-center gap-2">
        <input
          autoFocus={!entry}
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full min-w-0 bg-transparent text-center font-display text-5xl font-extrabold tabular outline-none placeholder:text-faint"
          style={{ color: amount ? tone : undefined }}
          aria-label="Amount"
        />
      </div>
      <div className="mb-4 flex justify-center gap-1.5">
        {CURRENCIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            className={cn(
              "h-7 rounded-full px-3 text-[0.7rem] font-bold",
              currency === c ? "bg-fg text-bg" : "bg-surface-2 text-muted",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <Label>Category</Label>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {shown.map((c) => {
          const on = c.name === category;
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => setCategory(c.name)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border p-2 transition-colors",
                on ? "border-fg/50 bg-surface-2" : "border-transparent",
              )}
            >
              <MoneyTile icon={c.icon} color={c.color} size={38} />
              <span className="w-full truncate text-center text-[0.62rem] font-bold">{c.name}</span>
            </button>
          );
        })}
      </div>

      <Label>Description</Label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Lunch with friends"
        className="mb-4 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none"
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div>
          <Label>Date</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none"
          />
        </div>
        <div>
          <Label>Account</Label>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              const a = accounts.find((x) => x.id === e.target.value);
              if (a && !entry) setCurrency(a.currency);
            }}
            className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Label>Receipt</Label>
      <div className="mb-5 flex items-center gap-2">
        {preview && !dropPhoto ? (
          <>
            <img src={preview} alt="Receipt" className="size-16 rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPreview(null);
                setDropPhoto(true);
              }}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-xs font-bold text-muted"
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            const f = await captureImage("any");
            if (!f) return;
            setPhoto(f);
            setDropPhoto(false);
            setPreview(URL.createObjectURL(f));
          }}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-xs font-bold"
        >
          <Camera className="size-3.5" /> {preview && !dropPhoto ? "Replace" : "Add a photo"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        className="h-12 w-full rounded-2xl text-sm font-bold text-white active:scale-[0.99]"
        style={{ background: tone }}
      >
        {entry ? "Save changes" : "Save transaction"}
      </button>
    </MoneySheet>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted">{children}</div>;
}
