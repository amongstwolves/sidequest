// Builds the demo video from the storyboard frames: slide layouts rendered in Chrome,
// voiceover from macOS text-to-speech, assembled with ffmpeg.
//
//   node scripts/make-video.mjs            -> storyboard/video/sidequest-demo.mp4
//   VOICE=Samantha RATE=185 node scripts/make-video.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const SB = join(process.cwd(), "storyboard");
const OUT = join(SB, "video");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VOICE = process.env.VOICE ?? "Samantha";
const RATE = process.env.RATE ?? "185";
mkdirSync(OUT, { recursive: true });

const OP = "FOR OPERATORS";
const BRAND = "FOR BRANDS";
const SLIDES = [
  { tag: OP, title: "YOUR CITY HAS SIDE QUESTS.", imgs: ["10-riley-home-offer", "01-riley-map"], vo: "There's thirty bucks two blocks from you. Want it?" },
  {
    tag: BRAND,
    title: "AI can plan the work.",
    sub: "It can't walk across the street.",
    imgs: ["02-mission-control"],
    vo: "Demo Brand Co. just shipped autumn displays to two cafés. Its AI can plan a campaign, but it can't walk into a café and check the display went up.",
  },
  {
    tag: BRAND,
    title: "Limits set by the brand.",
    sub: "Enforced by SIDEQUEST, not the agent.",
    imgs: ["03-agent-terminal-wide"],
    vo: "So its AI agent asks SIDEQUEST. Two hundred and fifty dollars? Refused. Over its daily limit, and the platform enforces that, not the agent. Seventy-five? Planned in seconds.",
  },
  {
    tag: BRAND,
    title: "Held, not spent.",
    sub: "One approval. PayPal holds the budget.",
    imgs: ["04a-plan-awaiting-approval", "04c-hold-authorized"],
    vo: "Two missions, sixty dollars, fifteen to spare. One approval, and PayPal holds the budget. Nothing's spent until the work is proven.",
  },
  {
    tag: OP,
    title: "ACCEPTED.",
    sub: "Ranked by distance, skills and reliability.",
    imgs: ["10-mission-offer-top", "10-riley-accepted"],
    vo: "Riley. Northgate Mill. Mission drops: thirty dollars, point two miles. Ranked first: closest, right skills, top reliability. Tap. It's his.",
  },
  {
    tag: OP,
    title: "✗ RESHOOT",
    sub: "AI checks every item on the checklist.",
    imgs: ["06a-riley-first-try-evaluating", "06a-riley-first-try-result"],
    vo: "Snap the storefront. Snap the display. AI checks every requirement. Price card? Missing. Reshoot.",
  },
  { tag: OP, title: "✓ LOCKED IN", sub: "Pass recommended.", imgs: ["06f-riley-pass-latest"], vo: "Price card in frame. Locked in." },
  {
    tag: "PAYDAY",
    title: "+$30",
    sub: "Paid via PayPal Payouts.",
    imgs: ["07a-approve-riley-approve", "07-you-got-paid"],
    note: "Sandbox payout settled about 40 seconds later",
    vo: "The brand approves. PayPal pays Riley. Real sandbox payout, real receipt.",
  },
  { tag: BRAND, title: "$15 released.", sub: "Unused budget is voided automatically.", imgs: ["07d-objective-ledger"], vo: "Last mission done, and the unused fifteen dollars is released automatically." },
  {
    tag: BRAND,
    title: "An AI agent that can act in the real world.",
    list: [
      "Describe the outcome, or let your agent ask",
      "Approve the plan: PayPal holds the budget",
      "Review AI-checked proof: you make the call",
      "Pay and close: unused budget released",
    ],
    imgs: ["08a-mission-control", "08-activity-paypal"],
    vo: "For the brand, that's an AI agent that can act in the real world. Describe the outcome, approve the plan, review the proof, pay and close. It works inside limits it can't change, and every dollar is held, captured, paid and released, with a receipt for each step.",
  },
  {
    tag: "SIDEQUEST",
    title: "Your city has side quests.",
    sub: "AI plans the work. People nearby get it done. PayPal pays them.",
    imgs: ["07-you-got-paid", "08a-mission-control"],
    end: true,
    vo: "AI plans the work. People nearby get it done. PayPal pays them.",
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = (s) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;overflow:hidden;font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#e8eef7;
background:radial-gradient(1200px 700px at 85% 40%,rgba(110,231,183,.13),transparent 60%),radial-gradient(900px 600px at 0% 100%,rgba(56,189,248,.08),transparent 60%),#070b14;display:flex;align-items:center;padding:0 110px;gap:80px}
.left{flex:1;min-width:0}
.logo{font-size:28px;font-weight:800;letter-spacing:.32em;margin-bottom:56px}.logo b{color:#6ee7b7}
.tag{display:inline-block;font-size:22px;font-weight:700;letter-spacing:.2em;color:#6ee7b7;border:2px solid rgba(110,231,183,.45);border-radius:999px;padding:8px 20px;margin-bottom:34px}
h1{font-size:${s.title.length > 26 ? 76 : 104}px;line-height:1.02;font-weight:850;letter-spacing:-.02em}
.sub{margin-top:28px;font-size:40px;line-height:1.25;color:#9fb0c6}
ol{margin-top:40px;padding:0;list-style:none;counter-reset:n}
li{counter-increment:n;font-size:34px;line-height:1.3;margin:18px 0;display:flex;gap:20px;color:#cbd6e4}
li:before{content:counter(n);flex:none;width:52px;height:52px;border-radius:50%;background:#6ee7b7;color:#071018;font-weight:800;display:grid;place-items:center;font-size:28px}
.note{margin-top:34px;font-size:24px;color:#fbbf24}
.url{margin-top:48px;font-size:30px;color:#6ee7b7;font-weight:600}.small{margin-top:10px;font-size:22px;color:#64748b}
.phones{display:flex;gap:44px;flex:none}
.phones img{height:940px;border-radius:54px;border:6px solid #1c2638;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.05)}
</style><body><div class="left">
<div class="logo">SIDE<b>QUEST</b></div>
<div class="tag">${esc(s.tag)}</div>
<h1>${esc(s.title)}</h1>
${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ""}
${s.list ? `<ol>${s.list.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>` : ""}
${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
${s.end ? `<p class="url">sidequest-9qkp.onrender.com</p><p class="small">PayPal AI Hackathon 2026 · sandbox demo · all brands, venues and people are fictional</p>` : ""}
</div><div class="phones">${s.imgs.map((i) => `<img src="file://${join(SB, i + ".png")}">`).join("")}</div></body>`;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

if (process.argv.includes("--lines")) {
  // Print the voiceover lines with the voice each should use, for generating clips elsewhere.
  for (const [i, s] of SLIDES.entries()) console.log(`vo${String(i).padStart(2, "0")}\t${s.tag === OP ? "operator" : "brand"}\t${s.vo}`);
  process.exit(0);
}

// 1. Slides
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
for (const [i, s] of SLIDES.entries()) {
  const f = join(OUT, `slide${String(i).padStart(2, "0")}.html`);
  writeFileSync(f, html(s));
  await page.goto("file://" + f, { waitUntil: "load" });
  await page.screenshot({ path: join(OUT, `slide${String(i).padStart(2, "0")}.png`) });
}
await browser.close();
console.log("slides rendered");

// 2. Voiceover and per-slide clips
const FPS = 30;
const clips = [];
for (const [i, s] of SLIDES.entries()) {
  const n = String(i).padStart(2, "0");
  // Prefer a recorded/generated clip (e.g. ElevenLabs) at storyboard/video/voice/vo<NN>.mp3; else macOS say.
  const custom = join(OUT, "voice", `vo${n}.mp3`);
  let aiff = custom;
  if (!existsSync(custom)) {
    aiff = join(OUT, `vo${n}.aiff`);
    if (process.env.SILENT_MISSING) {
      // No clip for this scene: hold the caption on screen in silence instead of switching voices.
      run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2.4", aiff]);
    } else {
      run("say", ["-v", VOICE, "-r", RATE, "-o", aiff, s.vo]);
    }
  }
  const voDur = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", aiff]));
  const lead = 0.35;
  const dur = +(voDur + lead + (s.end ? 2.5 : 0.7)).toFixed(2);
  const frames = Math.round(dur * FPS);
  const clip = join(OUT, `clip${n}.mp4`);
  run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", String(FPS), "-i", join(OUT, `slide${n}.png`),
    "-i", aiff,
    "-filter_complex",
    `[0:v]zoompan=z='1+0.035*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS},` +
      `fade=t=in:st=0:d=0.25,fade=t=out:st=${(dur - 0.25).toFixed(2)}:d=0.25,format=yuv420p[v];` +
      `[1:a]adelay=${lead * 1000}|${lead * 1000},apad,atrim=0:${dur},aresample=48000,aformat=channel_layouts=stereo[a]`,
    "-map", "[v]", "-map", "[a]", "-t", String(dur),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k",
    clip,
  ]);
  clips.push(clip);
  console.log(`clip ${n}: ${dur}s`);
}

// 3. Join
const list = join(OUT, "clips.txt");
writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n"));
const final = join(OUT, "sidequest-demo.mp4");
run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", final]);
console.log("wrote", final, run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final]).trim() + "s");
