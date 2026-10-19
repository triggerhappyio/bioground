// Bakes the default (Korean) first screen of the landing page into
// public/bioground/index.html, so crawlers that don't run JavaScript
// (KakaoTalk, Naver, iMessage, Facebook) see the real headline and copy.
// The page's script still renders on load and replaces this markup, so
// language switching and saved preferences work exactly as before.
//
// Re-run after any change to the landing page copy or layout:
//   npm i --no-save playwright && npx playwright install chromium   (once)
//   node scripts/prerender-landing.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "public", "bioground", "index.html");

// Elements the page script fills at runtime: [tag, id].
const TARGETS = [
  ["span", "brandSub"],
  ["div", "langs"],
  ["button", "sizeBtn"],
  ["main", "app"],
  ["footer", "foot"]
];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium");
  process.exit(1);
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  // Fresh profile + Korean locale = what a first-time Korean visitor sees.
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  // Block network (fonts, analytics) — only the page's own script matters.
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => document.getElementById("app")?.children.length > 0);
  const html = await page.evaluate(
    (ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id)?.innerHTML ?? ""])),
    TARGETS.map(([, id]) => id)
  );

  let src = await readFile(file, "utf8");
  for (const [tag, id] of TARGETS) {
    const re = new RegExp(`(<${tag}\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</${tag}>)`);
    if (!re.test(src)) throw new Error(`#${id} (<${tag}>) not found in ${file}`);
    if (!html[id]) throw new Error(`#${id} rendered empty — refusing to write`);
    src = src.replace(re, (_, open, close) => `${open}${html[id]}${close}`);
  }
  await writeFile(file, src);
  console.log(`Prerendered ${TARGETS.map(([, id]) => "#" + id).join(", ")} into ${path.relative(root, file)}`);
} finally {
  await browser.close();
}
