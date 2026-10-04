import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { buildXlsx } from "./xlsx.ts";

test("an xlsx with typed cells, escaped text and safe sheet names", () => {
  const bytes = buildXlsx([
    { name: "Time", rows: [["Project", "Hours"], ["Acme <Audit> & co", 3.5], ["Beta", 2]] },
    { name: "Bad/Name:*?", rows: [["x"]] },
  ]);
  if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, bytes);
  const files = unzipSync(bytes);
  assert.ok(files["xl/workbook.xml"] && files["xl/worksheets/sheet2.xml"]);
  const s1 = strFromU8(files["xl/worksheets/sheet1.xml"]!);
  assert.match(s1, /<c r="B2"><v>3.5<\/v><\/c>/);
  assert.match(s1, /Acme &lt;Audit&gt; &amp; co/);
  assert.match(strFromU8(files["xl/workbook.xml"]!), /name="Bad Name"/);
});
