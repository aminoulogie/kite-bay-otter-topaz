// Drives the installed Windows app through WebView2's debugging port (see
// .github/workflows/windows-check.yml): every page, both themes, screenshots.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const SHOTS = process.env.SHOTS ?? "windows-shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0]?.pages()[0];
if (!page) throw new Error("the app has no window");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.waitForSelector(".ws", { timeout: 60_000 });
console.log("app version:", await page.evaluate(() => document.title), page.url());

for (const theme of ["dark", "light"]) {
  await page.evaluate((t) => {
    const k = "soma-smart-coach-v1";
    const o = JSON.parse(localStorage.getItem(k));
    o.state.settings.theme = t;
    localStorage.setItem(k, JSON.stringify(o));
  }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".ws");
  const labels = (await page.locator(".ws-nav button").allInnerTexts()).map((l) => l.split("\n")[0].trim());
  for (const label of [...labels, "Settings"]) {
    await page.locator(".ws-nav button, .ws-side-foot button", { hasText: label }).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${theme}-${label.replace(/\W+/g, "-").toLowerCase()}.png` });
  }
}
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
console.log("every page opened without an error");
