// Drives the operator steps of a live run in headless Chrome and captures the in-between states
// for the storyboard (accept, AI evaluating, reshoot, pass). Uses the site's own demo photos.
//
//   node scripts/storyboard-run.mjs accept   <missionId> <operator_a|operator_b> <name>
//   node scripts/storyboard-run.mjs proof    <missionId> <operator_a|operator_b> <name> <photo1.jpg,photo2.jpg,...>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.STORYBOARD_BASE ?? "https://sidequest-9qkp.onrender.com";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(process.cwd(), "storyboard");
const [cmd, missionId, persona, name, photos] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const context = await browser.createBrowserContext();
await context.overridePermissions(BASE, []);
await context.setCookie({ name: "sq_persona", value: persona, domain: new URL(BASE).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
const page = await context.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const snap = async (suffix) => {
  const file = join(OUT, `${name}${suffix}.png`);
  await page.screenshot({ path: file });
  console.log("saved", file.replace(process.cwd() + "/", ""));
};
const scrollToText = (text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("main *")].find((e) => e.childElementCount === 0 && e.textContent?.trim().startsWith(t));
    el?.scrollIntoView({ block: "center" });
    return Boolean(el);
  }, text);

try {
  await page.goto(`${BASE}/missions/${missionId}`, { waitUntil: "networkidle2", timeout: 90_000 });
  await sleep(3000);

  if (cmd === "accept") {
    await scrollToText("Accept mission");
    await sleep(500);
    await snap("-before");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Accept mission")?.click());
    await sleep(5000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await snap("-accepted");
  }

  if (cmd === "approve") {
    // Requester approves a finished mission: capture, PayPal payout, then wait for PAID.
    await scrollToText("Proof is in");
    await sleep(500);
    await snap("-approve");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim().startsWith("Approve & pay"))?.click());
    await sleep(9000);
    await scrollToText("Payment to");
    await sleep(500);
    await snap("-pending");
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const paid = await page.evaluate(() => /Payment to[\s\S]{0,40}Paid/.test(document.querySelector("main")?.innerText ?? ""));
      if (paid) break;
    }
    await sleep(1000);
    await scrollToText("Payment to");
    await sleep(500);
    await snap("-paid");
  }

  if (cmd === "proof") {
    const list = photos.split(",");
    // Load the site's demo photos into the upload input, as a phone's photo picker would.
    await page.evaluate(async (files) => {
      const input = document.querySelector('input[type="file"]');
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([await (await fetch(`/demo-photos/${f}`)).blob()], f, { type: "image/jpeg" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, list);
    await sleep(2500);
    await scrollToText("Upload");
    await sleep(500);
    await snap("-selected");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Submit proof")?.click());
    await sleep(1800);
    await snap("-evaluating");
    // Wait for the AI evaluation to land (the page refreshes when it does).
    for (let i = 0; i < 40; i++) {
      await sleep(2000);
      const done = await page.evaluate(() => /pass recommended|changes requested|inconclusive|review required/i.test(document.querySelector("main")?.innerText ?? ""));
      if (done) break;
    }
    await sleep(1500);
    await page.evaluate(() => document.getElementById("proof-heading")?.scrollIntoView({ block: "start" }));
    await sleep(800);
    await snap("-result");
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await snap("-status");
  }
} finally {
  await browser.close();
}
