// Browser tests of the real app: the screens, not just the logic under them.
//
//   APP_URL   where the built app is served (default http://localhost:4173/)
//   SYNC_URL  a sync relay to use (default http://localhost:8787, e2e/sync-local.ts)
//   SHOTS     a folder to drop screenshots in (optional)
//
// Run by .github/workflows/e2e.yml on every push, against a production build.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:4173/";
const SYNC = process.env.SYNC_URL ?? "http://localhost:8787";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const KEY = "soma-smart-coach-v1";
let browser;

before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
});
after(async () => {
  await browser?.close();
});

/** A fresh device: its own storage, a desk-sized window, errors collected. */
async function device(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: opts.theme ?? "dark",
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForSelector(".ws", { timeout: 20_000 });
  return { ctx, page, errors };
}

const state = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}").state ?? {}, KEY);
const nav = async (page, label) => {
  await page.locator(".ws-nav button, .ws-side-foot button", { hasText: label }).first().click();
  await page.waitForTimeout(400);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

test("every workstation page opens without an error, in both themes", async () => {
  for (const theme of ["dark", "light"]) {
    const { ctx, page, errors } = await device({ theme });
    await page.evaluate(
      ([k, t]) => {
        const o = JSON.parse(localStorage.getItem(k));
        o.state.settings.theme = t;
        localStorage.setItem(k, JSON.stringify(o));
      },
      [KEY, theme],
    );
    await page.reload({ waitUntil: "networkidle" });
    const labels = await page.locator(".ws-nav button").allInnerTexts();
    assert.ok(labels.length >= 15, `only ${labels.length} pages in the sidebar`);
    for (const raw of [...labels, "Settings"]) {
      const label = raw.split("\n")[0].trim();
      await nav(page, label);
      const text = await page.locator(".ws-body").innerText();
      assert.ok(text.trim().length > 20, `${label} (${theme}) rendered nothing`);
      await shot(page, `${theme}-${label.replace(/\W+/g, "-").toLowerCase()}`);
    }
    assert.deepEqual(errors, [], `page errors in ${theme}`);
    await ctx.close();
  }
});

test("clock in, log what was done; the next step and notes land on the project", async () => {
  const { ctx, page, errors } = await device();
  // A project to work on.
  await page.locator(".ws-top .ws-btn.primary", { hasText: "Create" }).click();
  await page.locator(".ws-menu li", { hasText: "Project" }).dispatchEvent("mousedown");
  const title = page.locator(".ws-detail .ws-title-input");
  await title.fill("E2E audit");
  await title.press("Enter");
  await page.locator(".ws-detail .ws-field", { hasText: "Client" }).locator("input").fill("E2E Client");
  await page.locator(".ws-detail .ws-title-input").click();

  // A shift for that client.
  await page.locator(".ws-top button", { hasText: "Clock in" }).click();
  await page.locator(".ws-menu input").fill("E2E Client");
  await page.locator(".ws-menu input").press("Enter");
  await page.waitForSelector(".ws-clockpill");
  await page.locator(".ws-clockpill button[title='Clock out']").click();
  await page.getByRole("button", { name: /Add what I worked on/ }).click();
  const act = page.locator(".ws-activity").last();
  const pid = (await state(page)).projects.find((p) => p.name === "E2E audit").id;
  await act.locator("select").selectOption(pid);
  await act.locator("input[placeholder='What I did']").fill("Tested invoices");
  await act.locator("input[placeholder^='Next step']").fill("Send the findings memo");
  await act.locator("textarea").fill("Two unsigned");
  await page.locator(".ws-detail header").click();
  await page.waitForTimeout(300);

  const st = await state(page);
  const p = st.projects.find((x) => x.id === pid);
  assert.ok(p.steps.some((s) => s.label === "Send the findings memo"), "next step became a project step");
  assert.ok(p.log?.some((n) => n.text.includes("Tested invoices") && n.text.includes("Two unsigned")), "notes in the project feed");
  assert.equal(st.shifts.at(-1).client, "E2E Client");
  await shot(page, "worklog");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a timer logs time, and a client report exports as an Excel file", async () => {
  const { ctx, page, errors } = await device();
  await nav(page, "Projects");
  await page.locator("input[placeholder^='New project']").fill("Timer project");
  await page.locator("input[placeholder^='New project']").press("Enter");
  await page.locator(".ws-top button", { hasText: "Timer" }).click();
  await page.locator(".ws-menu li", { hasText: "Timer project" }).dispatchEvent("mousedown");
  await page.waitForTimeout(1500);
  await page.locator(".ws-top .ws-timer").click();
  await page.waitForTimeout(500);
  const entries = (await state(page)).timeEntries;
  assert.ok(entries.length >= 1 && entries.every((e) => e.end), `a finished time entry: ${JSON.stringify(entries)}`);

  await nav(page, "Reports");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Excel/ }).click(),
  ]);
  const path = await dl.path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "an .xlsx is a zip");
  assert.ok(dl.suggestedFilename().endsWith(".xlsx"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("two devices sync both ways — programmes included — and an undo reaches both", async () => {
  const a = await device();
  const b = await device();

  // A sets up sync and shows its code; B joins with it.
  await nav(a.page, "Settings");
  await a.page.getByRole("button", { name: "Set up on this device" }).click();
  await a.page.locator("input[placeholder*='workers.dev']").fill(SYNC);
  const code = (await a.page.locator("p.font-mono").innerText()).trim();
  await a.page.getByRole("button", { name: /start syncing/ }).click();
  await a.page.waitForFunction(() => !!localStorage.getItem("soma-sync-v1"));

  await nav(b.page, "Settings");
  await b.page.getByRole("button", { name: "Join with a recovery code" }).click();
  await b.page.locator("input[placeholder*='workers.dev']").fill(SYNC);
  await b.page.locator("input[placeholder^='XXXX']").fill(code);
  await b.page.getByRole("button", { name: "Join", exact: true }).click();
  await b.page.waitForFunction(() => !!localStorage.getItem("soma-sync-v1"));

  const syncNow = async (d) => {
    await d.page.locator(".ws-top .ws-sync").click();
    await d.page.waitForTimeout(800);
  };

  // A project made on B reaches A.
  await nav(b.page, "Projects");
  await b.page.locator("input[placeholder^='New project']").fill("Synced from B");
  await b.page.locator("input[placeholder^='New project']").press("Enter");
  await b.page.waitForTimeout(300);
  await syncNow(b);
  await syncNow(a);
  assert.ok((await state(a.page)).projects.some((p) => p.name === "Synced from B"), "B's project reached A");

  // A programme (kept outside the main store) made on A reaches B.
  await a.page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("soma-programs") ?? "[]");
    list.push({ id: "e2e-prog", name: "E2E split", kind: "week", days: ["Rest", "Push", "Pull", "Legs", "Rest", "Upper", "Lower"] });
    localStorage.setItem("soma-programs", JSON.stringify(list));
  });
  await syncNow(a);
  await syncNow(b);
  const bProgs = await b.page.evaluate(() => JSON.parse(localStorage.getItem("soma-programs") ?? "[]"));
  assert.ok(bProgs.some((p) => p.name === "E2E split"), "programme reached B");

  // B undoes that sync; the programme goes on B, and then on A.
  await nav(b.page, "Settings");
  await b.page.getByRole("button", { name: "Undo" }).first().click();
  await b.page.waitForTimeout(1200);
  const bAfter = await b.page.evaluate(() => JSON.parse(localStorage.getItem("soma-programs") ?? "[]"));
  assert.ok(!bAfter.some((p) => p.name === "E2E split"), "undo removed it on B");
  await syncNow(a);
  const aAfter = await a.page.evaluate(() => JSON.parse(localStorage.getItem("soma-programs") ?? "[]"));
  assert.ok(!aAfter.some((p) => p.name === "E2E split"), "the undo reached A");
  assert.ok((await state(a.page)).projects.some((p) => p.name === "Synced from B"), "an older sync is untouched");

  await shot(b.page, "sync-settings");
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  await a.ctx.close();
  await b.ctx.close();
});
