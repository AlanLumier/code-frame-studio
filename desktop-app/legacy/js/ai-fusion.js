/* 旧 CodeMV × 新 AI（无 Key）+ Lemo 风格素材
   1) 把 AI 面板接上 Electron 内置的无 Key 模型（window.codemvAI）
   2) 在 AI 面板里放入 Lemo-Opuscar 的风格素材卡片；选风格后生成代码会带 STYLE.md 摘要
*/
(function () {
  "use strict";
  var NS = window.CodeMV || {};
  var selected = null;
  var styleText = "";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function moneyLine(lines) {
    return (lines || []).slice(0, 80).map(function (l) {
      return "[" + (l.time != null ? l.time : l.start) + "s] " + l.text;
    }).join("\n");
  }

  function buildPrompt() {
    var s = NS.__getFoliaState ? (NS.__getFoliaState(0) || {}) : {};
    var lines = s.lines || [];
    return [
      "你是一名逐帧动画程序员。请只输出一个完整、可直接运行的 JavaScript 函数：",
      "function drawScene(ctx, f) { ... }",
      "可用参数：ctx 是 Canvas 2D 上下文；f.w / f.h 画布尺寸；f.t 当前秒；f.beat 节拍脉冲 0~1；f.energy 响度 0~1；f.progress 本句进度；f.line 当前歌词；f.palette 色板；f.rand(i) 确定性随机。",
      "禁止网络、DOM、文件、定时器、eval；禁止绘制文字。代码 50~110 行，必须完整闭合。",
      "歌曲：" + (s.title || "未命名") + " — " + (s.artist || ""),
      "时长：" + (s.duration || 0) + " 秒。",
      selected ? "目标风格（来自 Lemo-Opuscar）：" + selected.cn + " / " + selected.en : "目标风格：由你根据歌词决定。",
      styleText ? "风格说明（只学手法，不抄内容）：\n" + styleText.slice(0, 2200) : "",
      "歌词（time / text）：\n" + moneyLine(lines),
      "请写出完整函数代码，不要 markdown 代码块。"
    ].filter(Boolean).join("\n\n");
  }

  function clean(text) {
    return String(text || "").replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }

  async function generateCode(hint) {
    if (!window.codemvAI || !window.codemvAI.chat) {
      hint.textContent = "无 Key AI 只在 CodeMV 桌面版中可用。";
      return;
    }
    var codeText = document.getElementById("codeText");
    var codeHint = document.getElementById("codeHint");
    if (!codeText) return;
    hint.textContent = "正在让 AI 写画面代码（免费服务，可能需要等待）…";
    try {
      var result = await window.codemvAI.chat([
        { role: "system", content: "你是逐帧动画程序员，只输出完整可运行的 drawScene 代码，不解释。" },
        { role: "user", content: buildPrompt() }
      ]);
      var code = clean(result && result.text ? result.text : result);
      if (!/function\s+drawScene/.test(code)) throw new Error("模型没有返回 drawScene 函数");
      codeText.value = code;
      codeHint.textContent = "AI 已写入代码，正在运行…";
      hint.textContent = selected ? "已用「" + selected.cn + "」风格生成，正在运行。" : "已生成，正在运行。";
      var run = document.getElementById("btnCodeRun");
      if (run) setTimeout(function () { run.click(); }, 120);
    } catch (error) {
      hint.textContent = "生成失败：" + error.message;
    }
  }

  function installAiOverride() {
    if (!NS.llm || !NS.llm.generate || !window.codemvAI) return;
    var orig = NS.llm.generate.bind(NS.llm);
    NS.llm.generate = function (prompt) {
      try {
        if (NS.llm.isConfigured && NS.llm.isConfigured(NS.llm.load())) return orig(prompt);
      } catch (e) { /* ignore */ }
      return window.codemvAI.chat([
        { role: "system", content: "你是 MV 视觉导演。只输出合法 JSON，不输出解释或 markdown。" },
        { role: "user", content: prompt }
      ]).then(function (r) { return r && r.text ? r.text : r; });
    };
  }

  async function buildUi() {
    var panel = document.querySelector('[data-panel="ai"]');
    if (!panel || document.getElementById("lemoAiBlock")) return;
    var section = el("section", { class: "block block--flat", id: "lemoAiBlock" });
    var head = el("h2", null, "Lemo 风格 × AI ");
    head.appendChild(el("span", { class: "chip" }, "无 Key"));
    section.appendChild(head);
    section.appendChild(el("p", { class: "tip" }, "选一个 Lemo 风格，AI 会带 STYLE.md 摘要生成画面代码；免费模型每约 30 秒一次。"));
    var grid = el("div", { id: "lemoAiGrid" });
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:250px;overflow:auto;margin:8px 0";
    section.appendChild(grid);
    var actions = el("div", { class: "row" });
    var button = el("button", { class: "btn small primary", type: "button" }, "AI 生成画面代码");
    var hint = el("p", { class: "tip", id: "lemoAiHint" }, "先加载歌曲和歌词；不选风格也可以直接生成。");
    actions.appendChild(button);
    section.appendChild(actions);
    section.appendChild(hint);
    panel.insertBefore(section, panel.firstChild);
    button.addEventListener("click", function () { generateCode(hint); });

    try {
      var response = await fetch("/style-library/catalog.json");
      var list = await response.json();
      grid.innerHTML = "";
      list.slice(0, 18).forEach(function (style) {
        var card = el("button", { type: "button", title: style.line_cn || style.en });
        card.style.cssText = "padding:0;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.03);overflow:hidden;cursor:pointer;text-align:left;color:inherit";
        var img = el("img");
        img.src = "/style-library/img/" + style.slug + "_0.jpg";
        img.alt = style.cn;
        img.style.cssText = "width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111";
        var label = el("span", null, style.cn);
        label.style.cssText = "display:block;padding:5px 6px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        card.appendChild(img);
        card.appendChild(label);
        card.addEventListener("click", async function () {
          selected = style;
          Array.prototype.forEach.call(grid.children, function (c) { c.style.outline = "none"; });
          card.style.outline = "2px solid #ffb35c";
          styleText = "";
          hint.textContent = "正在读取「" + style.cn + "」风格说明…";
          try {
            var md = await fetch("/style-library/lemo/" + style.slug + ".md");
            styleText = md.ok ? await md.text() : "";
          } catch (e) { styleText = ""; }
          hint.textContent = "已选择「" + style.cn + "」· " + style.en + "，点上方按钮生成。";
        });
        grid.appendChild(card);
      });
    } catch (error) {
      grid.appendChild(el("p", { class: "tip" }, "风格素材加载失败：" + error.message));
    }
    installAiOverride();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(buildUi, 500); });
  } else {
    setTimeout(buildUi, 500);
  }
})();
