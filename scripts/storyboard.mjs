// Phone-size screenshots of the live app for the video storyboard and Devpost gallery.
// Uses the installed Google Chrome (puppeteer-core, no browser download).
//
//   node scripts/storyboard.mjs                 # all shots
//   node scripts/storyboard.mjs 01 05           # only shots whose name starts with these prefixes
//
// Output: storyboard/<name>.png at 390x844 CSS px, 3x device scale (1170x2532).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.STORYBOARD_BASE ?? "https://sidequest-9qkp.onrender.com";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(process.cwd(), "storyboard");
const HOST = new URL(BASE).hostname;

// Each shot: who is signed in, which page, optional steps, optional scroll target.
const SHOTS = [
  { name: "00-landing", persona: null, path: "/" },
  { name: "00-who-are-you", persona: null, path: "/start" },
  { name: "01-riley-home", persona: "operator_a", path: "/me" },
  { name: "01-riley-map", persona: "operator_a", path: "/discover" },
  { name: "02-mission-control", persona: "requester", path: "/control" },
  { name: "08-mission-control-missions", persona: "requester", path: "/control", scrollTo: "#missions-grid" },
  { name: "08-activity-ai-agent", persona: "requester", path: "/control", scrollTo: "#activity-grid", click: "AI agent" },
  { name: "08-activity-paypal", persona: "requester", path: "/control", scrollTo: "#activity-grid", click: "PayPal" },
  { name: "07-riley-paid", persona: "operator_a", path: "/me", scrollTo: "#done-heading" },
  // From a completed run (objective/mission ids passed via env so the list stays reusable).
  ...(process.env.SB_OBJECTIVE
    ? [{ name: "07-objective-paypal-ledger", persona: "requester", path: `/objectives/${process.env.SB_OBJECTIVE}`, scrollTo: "#payments-heading" }]
    : []),
  ...(process.env.SB_MISSION
    ? [
        { name: "06-proof-reshoot-then-pass", persona: "operator_a", path: `/missions/${process.env.SB_MISSION}`, scrollTo: "#proof-heading" },
        { name: "07-mission-paid", persona: "operator_a", path: `/missions/${process.env.SB_MISSION}`, scrollText: "Payment to" },
      ]
    : []),
];

// One-off mode: node scripts/storyboard.mjs --shot <name> <persona|none> <path-or-file-url> [css-selector-to-scroll-to]
function selected(all) {
  const args = process.argv.slice(2);
  if (args[0] === "--shot") {
    const [, name, persona, path, scrollTo] = args;
    return [{ name, persona: persona === "none" ? null : persona, path, scrollTo }];
  }
  return args.length ? all.filter((s) => args.some((p) => s.name.startsWith(p))) : all;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(browser, shot) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // Deny location so maps show the default demo area, never the machine's real location.
  await context.overridePermissions(BASE, []);
  if (shot.persona) {
    await context.setCookie({ name: "sq_persona", value: shot.persona, domain: HOST, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
  }
  const url = shot.path.startsWith("file://") ? shot.path : BASE + shot.path;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
  await sleep(3500); // streamed sections, map tiles, grids
  if (shot.scrollTo) {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), shot.scrollTo);
    await sleep(800);
  }
  if (shot.scrollText) {
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll("main h1, main h2, main h3, main p")].find((e) => e.innerText.startsWith(text));
      el?.closest("div")?.scrollIntoView({ block: "start" });
    }, shot.scrollText);
    await sleep(800);
  }
  if (shot.click) {
    await page.evaluate((label) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === label);
      b?.click();
    }, shot.click);
    await sleep(1200);
  }
  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await context.close();
  console.log("saved", file.replace(process.cwd() + "/", ""));
}

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
try {
  for (const shot of selected(SHOTS)) {
    try {
      await shoot(browser, shot);
    } catch (err) {
      console.error("failed", shot.name, err.message);
    }
  }
} finally {
  await browser.close();
}
