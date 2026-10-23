// codemv p5.brush 渲染器：加载 studio.html，注入场景脚本，逐帧截图。
// 用法：
//   node render.mjs --scene=js/scenes/demo_brush.js --frames=.tmp/frames.json \
//        --out=output/frames --width=360 --height=640 [--browser=path]

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (const item of argv.slice(2)) {
    const match = item.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) continue;
    out[match[1]] = match[2] === undefined ? true : match[2];
  }
  return out;
}

function findBrowser(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((path) => path && existsSync(path)) || null;
}

async function main() {
  const args = parseArgs(process.argv);
  const scenePath = resolve(args.scene || join(here, "scenes", "demo_brush.js"));
  const outDir = resolve(args.out || join(here, "..", "output", "p5_frames"));
  const width = parseInt(args.width || "360", 10);
  const height = parseInt(args.height || "640", 10);
  const framesFile = resolve(args.frames || "");
  if (!existsSync(scenePath)) throw new Error(`scene not found: ${scenePath}`);
  if (!framesFile || !existsSync(framesFile)) throw new Error(`frames json not found: ${framesFile}`);

  const browserPath = findBrowser(args.browser);
  if (!browserPath) throw new Error("Chrome/Edge not found; pass --browser=<path>");

  const frames = JSON.parse(readFileSync(framesFile, "utf8"));
  mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      "--allow-file-access-from-files",
      "--disable-gpu-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      "--force-device-scale-factor=1",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const pageUrl = pathToFileURL(join(here, "studio.html")).href + `?w=${width}&h=${height}`;
    await page.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.codemvReady === true", { timeout: 60000 });

    const sceneCode = readFileSync(scenePath, "utf8");
    await page.addScriptTag({ content: sceneCode });

    const canvas = await page.$("canvas");
    if (!canvas) throw new Error("canvas not found");

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const sceneError = await page.evaluate(
        (t, ctx) => window.codemvSetState(t, ctx),
        frame.t,
        frame.ctx,
      );
      if (sceneError) {
        console.error(`SCENE_ERROR: ${sceneError}`);
        process.exitCode = 2;
        return;
      }
      const file = join(outDir, `frame_${String(index).padStart(5, "0")}.png`);
      await canvas.screenshot({ path: file });
      console.log(`FRAME ${index + 1}/${frames.length}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`RENDER_ERROR: ${(error && error.stack) || error}`);
  process.exit(1);
});
