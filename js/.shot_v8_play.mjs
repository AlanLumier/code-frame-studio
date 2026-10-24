import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  await page.goto("http://127.0.0.1:8126/renderer/index.html", { waitUntil: "networkidle2", timeout: 60000 });
  await (await page.$("#fileAudio")).uploadFile("C:/Users/19577/Desktop/code-mv/desktop-app/assets/xihuan.mp3");
  await new Promise((r) => setTimeout(r, 1200));
  await (await page.$("#fileLyrics")).uploadFile("C:/Users/19577/Desktop/code-mv/desktop-app/assets/xihuan.lrc");
  await new Promise((r) => setTimeout(r, 1200));
  await page.click("#btnPlay");
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: "C:/Users/19577/Desktop/code-mv/output/app_v8_playing.png" });
  const info = await page.evaluate(() => ({
    title: document.getElementById("songTitle").textContent,
    lines: document.getElementById("lineCount").textContent,
    time: document.getElementById("timeNow").textContent,
  }));
  console.log(JSON.stringify(info), "errors", JSON.stringify(errors.slice(0, 3)));
} finally {
  await browser.close();
}
