/**
 * What was traded, and what a point of it is worth.
 *
 * The journal used to assume EUR/USD everywhere: one pip was 0.0001 and one
 * pip at 0.01 lots was ten cents, both written into the module as constants.
 * That is fine until the day you trade gold, at which point every number the
 * gate depends on is wrong by two orders of magnitude — a $3 stop on gold
 * reported as thirty thousand pips, a risk figure that says the trade is
 * impossible, and a 1% rule enforcing nothing.
 *
 * So an instrument carries its own two facts: the price step it is measured
 * in, and what one of those steps is worth per lot. Everything else in
 * `trading.ts` is derived from those, the same way it always was.
 *
 * ONLY USD-QUOTED INSTRUMENTS ARE HERE, and the omission is deliberate rather
 * than lazy. A pip of USD/JPY is worth 1000 yen, and what that is in dollars
 * depends on USD/JPY at the moment you ask. It is not a constant, this app has
 * no price feed, and a journal that guessed would quietly misreport the risk
 * on every yen trade. Better to not offer the pair than to offer it wrong.
 *
 * WHERE THE NUMBERS COME FROM. For forex and the metals they are contract
 * arithmetic and exact: a standard lot is 100,000 units of the base currency,
 * so a 0.0001 move on a dollar-quoted pair is 100,000 × 0.0001 = $10. Gold is
 * 100 ounces, so a one-cent move is $1. Silver is 5,000 ounces, so a
 * tenth-of-a-cent move is $5. Oil is 1,000 barrels, so a one-cent move is $10.
 *
 * For the indices and crypto there is no underlying contract to appeal to and
 * the figure below is the common CFD spec — one dollar per index point, one
 * coin per lot. Brokers differ. That is exactly why `perPoint` can be
 * overridden per instrument and the value is shown on the card rather than
 * hidden in here: a risk calculation you cannot check against your own broker
 * is a risk calculation you should not trust.
 */

export type MarketGroup = "Forex" | "Metals" | "Indices" | "Crypto" | "Energy";

export interface Instrument {
  id: string;
  /** How it is written on a platform. */
  name: string;
  group: MarketGroup;
  /** The price step this market is counted in. */
  point: number;
  /** Dollars per `point` at 1.00 lot. */
  perLot: number;
  /** What one step is called here, so a readout can say "pips" or "points". */
  unit: string;
  /** Decimals the price is quoted to. */
  decimals: number;
  /** A price of roughly the right shape, for the empty field. */
  sample: string;
}

/**
 * The default, and what every trade logged before this existed was.
 *
 * Nothing about an old trade changes by adding instruments, because the
 * numbers this one carries are the numbers that were compiled in.
 */
export const DEFAULT_INSTRUMENT = "EURUSD";

/** 100,000 units a lot × a 0.0001 pip = $10 a pip, for a dollar-quoted pair. */
const FX_PER_LOT = 10;

export const INSTRUMENTS: Instrument[] = [
  { id: "EURUSD", name: "EUR/USD", group: "Forex", point: 0.0001, perLot: FX_PER_LOT, unit: "pip", decimals: 5, sample: "1.17000" },
  { id: "GBPUSD", name: "GBP/USD", group: "Forex", point: 0.0001, perLot: FX_PER_LOT, unit: "pip", decimals: 5, sample: "1.32000" },
  { id: "AUDUSD", name: "AUD/USD", group: "Forex", point: 0.0001, perLot: FX_PER_LOT, unit: "pip", decimals: 5, sample: "0.65000" },
  { id: "NZDUSD", name: "NZD/USD", group: "Forex", point: 0.0001, perLot: FX_PER_LOT, unit: "pip", decimals: 5, sample: "0.59000" },
  { id: "USDCAD", name: "USD/CAD", group: "Forex", point: 0.0001, perLot: FX_PER_LOT, unit: "pip", decimals: 5, sample: "1.36000" },

  // 100 ounces a lot × $0.01 = $1 a point.
  { id: "XAUUSD", name: "Gold", group: "Metals", point: 0.01, perLot: 1, unit: "point", decimals: 2, sample: "2650.00" },
  // 5,000 ounces a lot × $0.001 = $5 a point.
  { id: "XAGUSD", name: "Silver", group: "Metals", point: 0.001, perLot: 5, unit: "point", decimals: 3, sample: "31.250" },

  // The common CFD spec: one dollar an index point at 1.00 lot. Check yours.
  { id: "US30", name: "US30 · Dow", group: "Indices", point: 1, perLot: 1, unit: "point", decimals: 1, sample: "44200.0" },
  { id: "NAS100", name: "NAS100", group: "Indices", point: 1, perLot: 1, unit: "point", decimals: 1, sample: "20500.0" },
  { id: "SPX500", name: "S&P 500", group: "Indices", point: 1, perLot: 1, unit: "point", decimals: 1, sample: "5900.0" },

  // One coin a lot, so a one-dollar move is a dollar. Check yours.
  { id: "BTCUSD", name: "Bitcoin", group: "Crypto", point: 1, perLot: 1, unit: "point", decimals: 2, sample: "95000.00" },
  { id: "ETHUSD", name: "Ethereum", group: "Crypto", point: 1, perLot: 1, unit: "point", decimals: 2, sample: "3200.00" },

  // 1,000 barrels a lot × $0.01 = $10 a point.
  { id: "XTIUSD", name: "Oil · WTI", group: "Energy", point: 0.01, perLot: 10, unit: "point", decimals: 2, sample: "71.50" },
];

export const GROUPS: MarketGroup[] = ["Forex", "Metals", "Indices", "Crypto", "Energy"];

/** The instrument, or EUR/USD — which is what an unlabelled trade was. */
export function instrumentOf(id: string | undefined): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]!;
}

export function instrumentName(id: string | undefined): string {
  return instrumentOf(id).name;
}

export function inGroup(group: MarketGroup): Instrument[] {
  return INSTRUMENTS.filter((i) => i.group === group);
}

/**
 * Dollars per point at 1.00 lot, after any correction the user has made.
 *
 * An override is kept only while it differs from the shipped figure, so a
 * table corrected today does not freeze a value that is fixed tomorrow.
 */
export function perPoint(id: string | undefined, overrides?: Record<string, number>): number {
  const inst = instrumentOf(id);
  const own = overrides?.[inst.id];
  return Number.isFinite(own) && (own as number) > 0 ? (own as number) : inst.perLot;
}

/** Store an override, dropping it when it matches the shipped value. */
export function setPerPoint(
  overrides: Record<string, number> | undefined,
  id: string,
  value: number,
): Record<string, number> {
  const next = { ...(overrides ?? {}) };
  const shipped = instrumentOf(id).perLot;
  if (!Number.isFinite(value) || value <= 0 || value === shipped) delete next[id];
  else next[id] = value;
  return next;
}

/** Only the overrides that name an instrument that exists, and are positive. */
export function cleanPointValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!INSTRUMENTS.some((i) => i.id === id)) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n !== instrumentOf(id).perLot) out[id] = n;
  }
  return out;
}

/** A price shown the way this market quotes it. */
export function formatPrice(id: string | undefined, price: number): string {
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(instrumentOf(id).decimals);
}

/** "12.0 pips", "300 points" — the unit the market is actually counted in. */
export function unitLabel(id: string | undefined, n: number): string {
  const inst = instrumentOf(id);
  const rounded = inst.point >= 1 ? Math.round(n) : Number(n.toFixed(1));
  return `${rounded} ${inst.unit}${rounded === 1 ? "" : "s"}`;
}
