import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import type { EditValues } from "@/lib/row-edit";

export interface EditField {
  key: string;
  label: string;
  value: string | number | undefined;
  kind?: "text" | "number" | "date";
  placeholder?: string;
  /** Fixed choices, shown as a row of chips instead of a free-text box. */
  options?: string[];
}

/**
 * One sheet for editing a row that is a handful of fields.
 *
 * Written once rather than five times. Most of the rows in this app are a name
 * and a number — a to-do, a word and its meaning, a shopping line, a ledger
 * entry — and each having its own bespoke editor would be five things to keep
 * in step for no gain to anybody using it.
 *
 * Edited as a DRAFT and written on save. A sheet that writes on every keystroke
 * turns a half-typed word into a stored one and, on a row whose identity is its
 * name, can quietly split it into two.
 */
export function RowEditSheet({
  title, fields, onClose, onSave, saveLabel = "Save",
}: {
  title: string;
  fields: EditField[];
  onClose: () => void;
  onSave: (values: EditValues) => void;
  saveLabel?: string;
}) {
  const [draft, setDraft] = useState<EditValues>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value == null ? "" : String(f.value)])),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));
  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <label
              key={f.key}
              className="block text-[0.6rem] font-bold uppercase tracking-wide text-faint"
            >
              {f.label}
              {f.options ? (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {f.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set(f.key, o)}
                      className={
                        draft[f.key] === o
                          ? "rounded-full bg-accent px-3 py-1.5 text-[0.7rem] font-bold text-accent-ink"
                          : "rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold text-muted"
                      }
                    >
                      {o}
                    </button>
                  ))}
                </span>
              ) : f.kind === "date" ? (
                // A native picker rather than a typed date: it is a wheel on a
                // phone, so there is no keyboard, nothing to parse and no way
                // to enter the 31st of February.
                <span className="mt-1 flex gap-2">
                  <Input
                    type="date"
                    className="flex-1 tabular"
                    value={draft[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                  {draft[f.key] ? (
                    <button
                      type="button"
                      onClick={() => set(f.key, "")}
                      className="h-11 shrink-0 rounded-xl border border-border bg-surface-2 px-3 text-[0.7rem] font-bold text-muted"
                    >
                      Clear
                    </button>
                  ) : null}
                </span>
              ) : f.kind === "number" ? (
                <DecimalInput
                  className="mt-1"
                  placeholder={f.placeholder}
                  value={draft[f.key] ?? ""}
                  onValueChange={(_n, raw) => set(f.key, raw)}
                />
              ) : (
                <Input
                  className="mt-1"
                  placeholder={f.placeholder}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                />
              )}
            </label>
          ))}
        </div>

        <Button variant="primary" className="mt-4 w-full" onClick={save}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
