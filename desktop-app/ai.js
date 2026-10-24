const AI_URL = "https://text.pollinations.ai/openai";

function cleanCode(text) {
  let code = String(text || "").trim();
  code = code.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  const start = code.indexOf("function drawScene");
  if (start >= 0) code = code.slice(start);
  const end = code.lastIndexOf("}");
  if (end >= 0) code = code.slice(0, end + 1);
  return code;
}

function isCompleteFunction(code) {
  if (!code || !code.includes("function drawScene")) return false;
  try {
    const factory = new Function(`"use strict";\n${code}\nreturn drawScene;`);
    return typeof factory() === "function";
  } catch {
    return false;
  }
}

function buildMessages(payload) {
  const {
    line = "",
    prev = "",
    next = "",
    lineStart = 0,
    lineEnd = 0,
    bpm = 0,
    duration = 0,
    mood = "",
    palette = [],
  } = payload || {};

  const system = `你是一名逐帧动画程序员。根据用户给出的歌词句子，写一段 JavaScript 画面代码。
只输出代码：一个完整函数
function drawScene(ctx, f) { ... }
不要解释，不要输出 Markdown 代码围栏。

可用参数：
- ctx：Canvas 2D 上下文；画布尺寸为 f.w x f.h，坐标原点在左上角；
- f.t：进入本句后的秒数；f.lineDuration：本句时长；
- f.beat：0~1 节拍脉冲（落在拍点时为 1，随后衰减）；
- f.energy：0~1 当前响度；f.progress：本句进度 0~1；
- f.line：当前歌词；f.palette：主色数组（十六进制字符串）；
- f.rand(i)：确定性的 0~1 随机数，同一个 i 每次结果相同。

已经加载了画面工具箱（全局函数，参数均为 (ctx, f, options)），优先组合它们：
- skSky(ctx,f,{stops:["#050811","#0d1830","#1d2c50"]}) 渐变天空
- skStars(ctx,f,{count,top}) 星星
- skGlow(ctx,f,{x,y,r,color,alpha}) 光晕
- skMoon(ctx,f,{x,y,r,color,glow}) / skSun(ctx,f,{x,y,r,color})
- skSea(ctx,f,{horizon,colors,moonX}) 分层海面 + 月光倒影
- skMountains(ctx,f,{horizon,color,layers}) 远山
- skCity(ctx,f,{horizon,color,light}) 城市天际线
- skWindow(ctx,f,{x,y,w,h}) 窗框
- skLanterns(ctx,f,{count,color}) 漂浮灯笼
- skShadows(ctx,f,{count,baseY}) 地面长影
- skTrees(ctx,f,{count,color,baseY}) 树影
- skRain / skSnow / skFireflies / skLightRays / skBoat / skPerson
- skVignette(ctx,f) 暗角（最后调用）

硬性要求：
1. 画面必须直接画出这句歌词里的具体意象（物体、场景、动作），不要用抽象色块糊弄。
2. 至少组合 3 个工具箱函数，再补充 1~2 个自己的绘制细节；最后调用 skVignette。
3. 至少 3 个元素在持续运动（位置、大小或透明度随 f.t / f.beat 变化）。
4. 有明暗层次：背景大面积渐变 → 中景主体 → 前景点缀；允许光晕、阴影、倒影。
5. 禁止绘制任何文字、歌词、水印；歌词由应用叠加。
6. 只能使用 ctx、f 与 sk 开头的工具箱函数，禁止网络、DOM、文件、定时器。
7. 代码控制在 40~70 行，必须写完整的函数，最后一行是闭合的 }.`;

  const user = `歌词句子：「${line}」
上一句：「${prev || "（开头）"}」
下一句：「${next || "（结尾）"}」
本句时间：${Number(lineStart).toFixed(1)}s - ${Number(lineEnd).toFixed(1)}s（时长 ${Math.max(0.4, lineEnd - lineStart).toFixed(1)}s）
歌曲 BPM：${bpm || "未知"}；总时长：${duration ? Number(duration).toFixed(1) + "s" : "未知"}
整体感觉：${mood || "由你根据歌词判断"}
配色参考：${palette.join(", ")}
请输出完整函数代码（40~70 行）。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function callAI(messages, timeoutMs = 150000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "codemv-desktop/0.6" },
      body: JSON.stringify({
        model: "openai",
        messages,
        max_tokens: 2200,
        temperature: 0.75,
        referrer: "codemv-desktop",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI 服务返回 HTTP ${response.status}`);
    const data = await response.json();
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    if (!content || !content.trim()) throw new Error("AI 返回内容为空");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function generateScene(payload) {
  const messages = buildMessages(payload);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const text = await callAI(messages);
      const code = cleanCode(text);
      if (isCompleteFunction(code)) return code;
      lastError = new Error("AI 返回的代码不完整");
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content:
          "上面的代码不完整或存在语法错误。请重新输出一个完整、可运行的 drawScene 函数，" +
          "控制在 50 行以内，最后一行必须是闭合的 }，不要任何解释。",
      });
    } catch (error) {
      lastError = error;
      const rateLimited = /402|free limit|FREE_LIMIT/i.test(String(error.message));
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, rateLimited ? 32000 : 1200));
    }
  }
  throw new Error(lastError ? lastError.message : "AI 生成失败");
}

async function chat(messages) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await callAI(messages);
    } catch (error) {
      lastError = error;
      const rateLimited = /402|free limit|FREE_LIMIT/i.test(String(error.message));
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, rateLimited ? 32000 : 1200));
    }
  }
  throw new Error(lastError ? lastError.message : "AI 生成失败");
}

module.exports = { buildMessages, generateScene, chat, cleanCode, isCompleteFunction };
