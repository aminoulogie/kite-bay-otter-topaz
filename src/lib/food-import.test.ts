import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectDelimiter, looksLikeCsv, parseFoodCsv, rowToFood, splitCsvLine, toCsvUrl,
} from "./food-import.ts";

test("a quoted comma inside a product name does not shift the columns", () => {
  // The normal case in a shop's catalogue, and the one a naive split ruins.
  const cells = splitCsvLine('"Yaourt, nature",6111234567890,61', ",");
  assert.deepEqual(cells, ["Yaourt, nature", "6111234567890", "61"]);
});

test("doubled quotes inside a quoted field are one quote", () => {
  assert.deepEqual(splitCsvLine('"Say ""hi""",2', ","), ['Say "hi"', "2"]);
});

test("the delimiter is taken from the header, not assumed", () => {
  assert.equal(detectDelimiter("name;barcode;kcal"), ";");
  assert.equal(detectDelimiter("name\tbarcode\tkcal"), "\t");
  assert.equal(detectDelimiter("name,barcode,kcal"), ",");
  // A single column has no delimiter to find; comma is the safe default.
  assert.equal(detectDelimiter("name"), ",");
});

test("French headings map to the same columns as English ones", () => {
  const csv = [
    "Nom;Code barre;Energie;Proteines;Glucides;Lipides",
    "Raib;6130760000171;70;3,4;8,5;2,5",
  ].join("\n");
  const { rows } = parseFoodCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.name, "Raib");
  assert.equal(rows[0]!.barcode, "6130760000171");
  assert.equal(rows[0]!.cals, 70);
  // Comma decimals, which is how a French sheet writes them.
  assert.equal(rows[0]!.p, 3.4);
  assert.equal(rows[0]!.f, 2.5);
});

test("a brand column is folded into the name, without repeating it", () => {
  const { rows } = parseFoodCsv(
    ["name,brand,kcal", "Raib,Soummam,70", "Soummam Lben,Soummam,40"].join("\n"),
  );
  assert.equal(rows[0]!.name, "Soummam Raib");
  assert.equal(rows[1]!.name, "Soummam Lben", "a name already carrying the brand is left alone");
});

test("a barcode Excel has mangled into scientific notation is dropped, not stored", () => {
  // 6.13076E+12 cannot be recovered, and a wrong code is worse than none: it
  // would either never match a scan or match the wrong product.
  const { rows } = parseFoodCsv(["name,ean,kcal", "Flan,6.13076E+12,110"].join("\n"));
  assert.equal(rows[0]!.barcode, undefined);
});

test("a plausible barcode is kept and stripped of punctuation", () => {
  const { rows } = parseFoodCsv(["name,ean", "Lben,6 130 760 000 171"].join("\n"));
  assert.equal(rows[0]!.barcode, "6130760000171");
});

test("a row with only a name still imports", () => {
  // A food with no macros is one you can correct; a refused import is not.
  const { rows, skipped } = parseFoodCsv(["name,kcal", "Mystery Snack,"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(skipped, 0);
  assert.equal(rowToFood(rows[0]!).cals, 0);
});

test("rows with no name are skipped and counted", () => {
  const { rows, skipped } = parseFoodCsv(["name,kcal", ",50", "Bread,265"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
});

test("unrecognised columns are reported rather than silently dropped", () => {
  const { unmapped } = parseFoodCsv(["name,kcal,shelf,supplier", "Bread,265,A4,X"].join("\n"));
  assert.ok(unmapped.includes("shelf"));
  assert.ok(unmapped.includes("supplier"));
});

test("a sheet with no recognised name column falls back to the first", () => {
  const { rows } = parseFoodCsv(["Désignation produit,kcal", "Kesra,290"].join("\n"));
  assert.equal(rows[0]!.name, "Kesra");
});

test("a drink row keeps its unit and water content", () => {
  const { rows } = parseFoodCsv(
    ["name,unit,water,kcal,serving", "Orange Juice,ml,88,45,100"].join("\n"),
  );
  const food = rowToFood(rows[0]!);
  assert.equal(food.unit, "ml");
  assert.equal(food.waterPct, 88);
  assert.equal(food.serving, 100);
});

test("water above 100% is clamped rather than trusted", () => {
  const { rows } = parseFoodCsv(["name,water", "Water,180"].join("\n"));
  assert.equal(rowToFood(rows[0]!).waterPct, 100);
});

test("an imported food carries a per-100 basis so portions rescale", () => {
  const { rows } = parseFoodCsv(["name,kcal,protein", "Tuna,116,25.5"].join("\n"));
  assert.deepEqual(rowToFood(rows[0]!).per100, {
    cals: 116, p: 25.5, c: 0, f: 0, fiber: 0,
  });
});

// ----------------------------------------------------------------- sheet URL

test("a Google Sheets editing link becomes its CSV export", () => {
  const out = toCsvUrl("https://docs.google.com/spreadsheets/d/ABC123/edit#gid=456");
  assert.equal(out, "https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=456");
});

test("a sheet link with no tab defaults to the first", () => {
  const out = toCsvUrl("https://docs.google.com/spreadsheets/d/ABC123/edit");
  assert.ok(out!.endsWith("gid=0"));
});

test("any other http URL is passed through, and rubbish is refused", () => {
  assert.equal(toCsvUrl("https://example.com/foods.csv"), "https://example.com/foods.csv");
  assert.equal(toCsvUrl("not a url"), null);
  assert.equal(toCsvUrl("   "), null);
});

test("a sign-in page is not mistaken for a spreadsheet", () => {
  assert.equal(looksLikeCsv("<!DOCTYPE html><html><body>Sign in</body></html>"), false);
  assert.equal(looksLikeCsv("name,kcal\nBread,265"), true);
});
