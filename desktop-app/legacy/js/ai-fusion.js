/* 旧 CodeMV × AI：内置免费模型 + 可选自有 Key + Lemo 参考风格 */
(function () {
  "use strict";
  var NS = window.CodeMV || {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function config() {
    try { return NS.llm && NS.llm.load ? NS.llm.load() : {}; } catch (e) { return {}; }
  }

  async function chatAI(messages) {
    if (window.codemvAI && window.codemvAI.chat) {
      var bridgeResult = await window.codemvAI.chat(messages);
      return bridgeResult && bridgeResult.text ? bridgeResult.text : bridgeResult;
    }
    var cfg = config();
    if (cfg.base && cfg.model) {
      var base = String(cfg.base).replace(/\/+$/, "");
      var headers = { "Content-Type": "application/json" };
      if (cfg.key) headers.Authorization = "Bearer " + cfg.key;
      var response = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ model: cfg.model, temperature: 0.7, messages: messages })
      });
      var data = await response.json();
      var content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
      if (!response.ok || !content) throw new Error("模型返回 " + response.status);
      return content;
    }
    var local = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages })
    });
    var payload = await local.json().catch(function () { return {}; });
    if (!local.ok || !payload.ok) throw new Error(payload.error || ("AI 服务 " + local.status));
    return payload.text;
  }

  function buildPrompt() {
    var s = NS.__getFoliaState ? (NS.__getFoliaState(0) || {}) : {};
    var lines = s.lines || [];
    var ref = window.LEMO_REF;
    var lyrics = lines.slice(0, 80).map(function (l) {
      return "[" + (l.time != null ? l.time : l.start) + "s] " + l.text;
    }).join("\n");
    return [
      "你是一名逐帧动画程序员。只输出一个完整、可直接运行的 JavaScript 函数：",
      "function drawScene(ctx, f) { ... }",
      "ctx 是 Canvas 2D；f.w/f.h 是画布尺寸；f.t 是当前秒；f.beat 节拍 0~1；f.energy 响度 0~1；f.progress 本句进度；f.line 当前歌词；f.palette 色板；f.rand(i) 确定性随机。",
      "禁止网络、DOM、文件、定时器、eval；禁止绘制文字。代码 50~110 行，必须完整闭合。",
      "歌曲：" + (s.title || "未命名") + " — " + (s.artist || ""),
      "时长：" + (s.duration || 0) + " 秒。",
      ref ? "目标风格（Lemo 参考）：" + ref.cn + " / " + ref.en : "目标风格：由你根据歌词决定。",
      ref && ref.md ? "风格说明（学手法，不抄内容）：\n" + ref.md.slice(0, 2000) : "",
      "歌词：\n" + lyrics,
      "请输出完整函数代码，不要 markdown 代码块。"
    ].filter(Boolean).join("\n\n");
  }

  function clean(text) {
    return String(text || "").replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }

  async function generateCode(hint) {
    var codeText = document.getElementById("codeText");
    var codeHint = document.getElementById("codeHint");
    if (!codeText) return;
    hint.textContent = "正在生成画面代码…（免费模型每约 30 秒一次）";
    try {
      var text = await chatAI([
        { role: "system", content: "你是逐帧动画程序员，只输出完整可运行的 drawScene 代码，不解释。" },
        { role: "user", content: buildPrompt() }
      ]);
      var code = clean(text);
      if (!/function\s+drawScene/.test(code)) throw new Error("模型没有返回 drawScene 函数");
      codeText.value = code;
      codeHint.textContent = "AI 已写入代码，正在运行…";
      hint.textContent = "已生成，正在运行。";
      var run = document.getElementById("btnCodeRun");
      if (run) setTimeout(function () { run.click(); }, 120);
    } catch (error) {
      hint.textContent = "生成失败：" + error.message;
    }
  }

  function installOverride() {
    if (!NS.llm || !NS.llm.generate) return;
    var orig = NS.llm.generate.bind(NS.llm);
    NS.llm.generate = function (prompt) {
      var cfg = config();
      if (cfg.base && cfg.model) return orig(prompt);
      return chatAI([
        { role: "system", content: "你是 MV 视觉导演。只输出合法 JSON，不输出解释或 markdown。" },
        { role: "user", content: prompt }
      ]);
    };
  }

  function boot() {
    var panel = document.querySelector('[data-panel="ai"]');
    if (!panel || document.getElementById("aiFusionBlock")) return;

    // 模型设置放到 AI 面板顶部并展开，网页端也能填 Key。
    var model = null;
    var details = panel.querySelectorAll("details");
    for (var i = 0; i < details.length; i += 1) {
      if (details[i].querySelector("#llmBase")) { model = details[i]; break; }
    }
    if (model) {
      model.open = true;
      var note = model.querySelector(".tip");
      if (note) note.textContent = "不填 Key 使用内置免费模型；网页端也可以在这里使用自己的 OpenAI 兼容 Key。";
      panel.insertBefore(model, panel.firstChild);
    }

    var section = el("section", "block block--flat");
    section.id = "aiFusionBlock";
    var head = el("h2", null, "AI 写画面 ");
    head.appendChild(el("span", "chip", "无 Key 可用"));
    section.appendChild(head);
    section.appendChild(el("p", "tip", "不填模型 Key 时走内置免费模型；也可在下方模型设置里填自己的 Key。Lemo 参考风格在左侧「风格」里选择。"));
    var selected = el("p", "tip");
    selected.id = "aiFusionSelected";
    selected.textContent = "未选择 Lemo 参考风格（在「风格」页选择）";
    section.appendChild(selected);
    var btn = el("button", "btn small primary", "AI 生成画面代码");
    btn.type = "button";
    section.appendChild(btn);
    var hint = el("p", "tip");
    hint.id = "aiFusionHint";
    hint.textContent = "先加载歌曲和歌词，再点生成。";
    section.appendChild(hint);

    if (model && model.nextSibling) panel.insertBefore(section, model.nextSibling);
    else panel.insertBefore(section, panel.firstChild);

    btn.addEventListener("click", function () { generateCode(hint); });
    setInterval(function () {
      if (window.LEMO_REF) selected.textContent = "已选择 Lemo 参考：" + window.LEMO_REF.cn + " · " + window.LEMO_REF.en;
    }, 800);

    var css = document.createElement("style");
    css.textContent = ".inspector{overflow-y:auto!important;min-height:0}.inspector .tab-panel{padding-bottom:110px}.inspector-foot{position:sticky;bottom:0;z-index:5;background:rgba(8,9,12,.94);backdrop-filter:blur(10px)}.tab-panel{min-height:0}.style-list{max-height:42vh;overflow:auto}";
    document.head.appendChild(css);
    installOverride();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 650); });
  } else {
    setTimeout(boot, 650);
  }
})();
