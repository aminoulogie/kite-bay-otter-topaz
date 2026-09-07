import type { FoodItem } from "./types.ts";

/**
 * Loading a spreadsheet of foods.
 *
 * This is the honest route to a large branded library. Real barcodes and real
 * label figures have to come from somewhere that knows them; a supermarket
 * sheet does, and inventing them does not. One paste and a shop's whole
 * catalogue is in the app, offline, scannable.
 *
 * Deliberately forgiving about the sheet's shape. A sheet built by a person is
 * never in the order a parser wants, so columns are matched by header name in
 * several languages rather than by position, and a row missing everything but
 * a name is still imported — a food with no macros is a food you can correct,
 * which beats a failed import telling you row 412 is wrong.
 */

/** Header spellings that mean the same column. Lowercased, accent-stripped. */
const COLUMNS: Record<keyof ParsedRow | "ignore", string[]> = {
  name: ["name", "food", "product", "produit", "nom", "aliment", "libelle", "description", "designation"],
  barcode: ["barcode", "ean", "ean13", "upc", "gtin", "code", "code barre", "codebarre", "code-barres"],
  brand: ["brand", "marque", "marca"],
  cals: ["calories", "kcal", "cal", "energy", "energie", "energy kcal", "valeur energetique"],
  p: ["protein", "proteins", "proteine", "proteines", "prot"],
  c: ["carbs", "carb", "carbohydrate", "carbohydrates", "glucides", "glucide"],
  f: ["fat", "fats", "lipides", "lipide", "matieres grasses"],
  fiber: ["fiber", "fibre", "fibres", "fiber g"],
  sodium: ["sodium", "salt", "sel"],
  serving: ["serving", "portion", "per", "base", "quantite"],
  unit: ["unit", "unite", "measure"],
  waterPct: ["water", "eau", "water %", "water percent", "hydration"],
  group: ["group", "category", "categorie", "rayon", "type"],
  ignore: [],
};

export interface ParsedRow {
  name: string;
  barcode?: string;
  brand?: string;
  cals?: number;
  p?: number;
  c?: number;
  f?: number;
  fiber?: number;
  sodium?: number;
  serving?: number;
  unit?: string;
  waterPct?: number;
  group?: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-.]/g, " ").trim();

/**
 * Split one CSV line, honouring quotes.
 *
 * Written out rather than a regex because a product name containing a comma —
 * "Yaourt, nature" — is the normal case in a shop's catalogue, and splitting
 * on every comma silently shifts every column after it.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Comma, semicolon or tab — whichever the header row uses most. */
export function detectDelimiter(header: string): string {
  const counts = [",", ";", "\t"].map((d) => ({ d, n: header.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]!.n > 1 ? counts[0]!.d : ",";
}

function toNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  // Comma decimals, thousands separators and a trailing unit all appear in
  // real sheets: "1 234,5 kcal" has to read as 1234.5.
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A barcode, or nothing.
 *
 * Excel turns a 13-digit code into 6.13076E+12 the moment it decides the
 * column is numeric, and that is NOT recoverable — stripping the punctuation
 * gives 61307612, which is eight digits, looks like a valid EAN-8 and is
 * simply a different product. So anything carrying a decimal point or an
 * exponent is refused outright rather than salvaged into a wrong answer.
 * Spaces and dashes are fine; people write codes in groups.
 */
export function cleanBarcode(raw: string | undefined): string | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  // A digit string, optionally grouped. Nothing else is trustworthy.
  if (!/^[\d\s-]+$/.test(text)) return undefined;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : undefined;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Header names that were not recognised, so the user can see what was ignored. */
  unmapped: string[];
  skipped: number;
}

/**
 * Parse a CSV into rows. Nothing is written anywhere — the caller decides.
 */
export function parseFoodCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], unmapped: [], skipped: 0 };

  const delimiter = detectDelimiter(lines[0]!);
  const header = splitCsvLine(lines[0]!, delimiter).map(norm);

  const index: Partial<Record<keyof ParsedRow, number>> = {};
  const unmapped: string[] = [];

  header.forEach((h, i) => {
    let matched = false;
    for (const [field, spellings] of Object.entries(COLUMNS)) {
      if (field === "ignore") continue;
      if (spellings.some((s) => h === s || h.startsWith(`${s} `) || h.startsWith(`${s}(`))) {
        const key = field as keyof ParsedRow;
        if (index[key] == null) index[key] = i;
        matched = true;
        break;
      }
    }
    if (!matched && h) unmapped.push(h);
  });

  // Without a name column there is nothing to import, so fall back to the
  // first column rather than refusing a sheet whose header says "Désignation
  // produit" in a spelling nobody anticipated.
  if (index.name == null) index.name = 0;

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    const at = (k: keyof ParsedRow) => (index[k] != null ? cells[index[k]!] : undefined);

    const name = (at("name") ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const brand = (at("brand") ?? "").trim();
    const barcode = cleanBarcode(at("barcode"));

    rows.push({
      // "Soummam Raib" reads better in a picker than "Raib" alone, and matches
      // how the scanner already names what it finds.
      name: brand && !norm(name).startsWith(norm(brand)) ? `${brand} ${name}` : name,
      barcode,
      cals: toNumber(at("cals")),
      p: toNumber(at("p")),
      c: toNumber(at("c")),
      f: toNumber(at("f")),
      fiber: toNumber(at("fiber")),
      sodium: toNumber(at("sodium")),
      serving: toNumber(at("serving")),
      unit: (at("unit") ?? "").trim().toLowerCase() === "ml" ? "ml" : undefined,
      waterPct: toNumber(at("waterPct")),
      group: (at("group") ?? "").trim() || undefined,
    });
  }

  return { rows, unmapped, skipped };
}

/** A parsed row as a library food. */
export function rowToFood(row: ParsedRow): FoodItem {
  const cals = row.cals ?? 0;
  const p = row.p ?? 0;
  const c = row.c ?? 0;
  const f = row.f ?? 0;
  const fiber = row.fiber ?? 0;
  return {
    name: row.name.trim(),
    serving: row.serving && row.serving > 0 ? row.serving : 100,
    unit: row.unit ?? "g",
    cals, p, c, f, fiber,
    sodium: row.sodium ?? 0,
    potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
    meal: "",
    barcode: row.barcode,
    group: row.group,
    waterPct: row.waterPct && row.waterPct > 0 ? Math.min(100, row.waterPct) : undefined,
    per100: { cals, p, c, f, fiber },
  };
}

/**
 * Turn a Google Sheets link into something fetchable.
 *
 * A person copies the address bar, which is the editing URL and returns HTML.
 * The CSV export lives at a different path, so the sheet id and tab are pulled
 * out and the right URL is rebuilt — otherwise every first attempt fails with
 * something that looks like a network error and is really a wrong link.
 *
 * The sheet still has to be shared (File → Share → anyone with the link), and
 * a private one comes back as HTML, which the caller reports plainly.
 */
export function toCsvUrl(input: string): string | null {
  const url = input.trim();
  if (!url) return null;

  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (sheet) {
    const id = sheet[1]!;
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }

  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

/** Whether what came back is a spreadsheet rather than a sign-in page. */
export function looksLikeCsv(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html")) return false;
  return text.includes("\n") || text.includes(",") || text.includes(";");
}
