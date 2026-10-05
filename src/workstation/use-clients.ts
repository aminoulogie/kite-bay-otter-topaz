import { useMemo } from "react";
import { useSoma } from "@/lib/store";

/** Every client name the app knows: projects, past shifts and rates. */
export function useClients(): string[] {
  const projects = useSoma((s) => s.projects);
  const shifts = useSoma((s) => s.shifts);
  const rates = useSoma((s) => s.settings.clientRates);
  return useMemo(() => {
    const seen = new Map<string, number>();
    // Most recently worked first, so the usual client is one click away.
    for (const s of [...shifts].sort((a, b) => b.start - a.start))
      if (!seen.has(s.client)) seen.set(s.client, seen.size);
    for (const p of projects) if (p.client && !seen.has(p.client)) seen.set(p.client, seen.size);
    for (const c of Object.keys(rates ?? {})) if (!seen.has(c)) seen.set(c, seen.size);
    return [...seen.keys()];
  }, [projects, shifts, rates]);
}
