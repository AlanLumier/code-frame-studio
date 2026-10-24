import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--allow-file-access-from-files"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  await page.goto("http://127.0.0.1:8126/renderer/index.html", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: "C:/Users/19577/Desktop/code-mv/output/app_v8_welcome.png" });
  await page.click('.rail-btn[data-tab="settings"]');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: "C:/Users/19577/Desktop/code-mv/output/app_v8_settings.png" });
  console.log("errors", JSON.stringify(errors.slice(0, 6)));
} finally {
  await browser.close();
}
