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
    var base = "";
    try {
      base = NS.sceneCode.buildPrompt({
        lines: lines,
        duration: s.duration || 0,
        sections: s.sections || []
      });
    } catch (e) {
      base = "请按 CodeMV 的 drawScene(ctx, f) 规则输出代码。画布尺寸用 f.W / f.H，色板用 f.pal，当前歌词用 f.line，时间用 f.t。只输出函数体，不要 markdown。";
    }
    if (ref) {
      base += "\n\n【额外风格参考（Lemo）】\n风格：" + ref.cn + " / " + ref.en +
        "\n说明：\n" + (ref.md ? ref.md.slice(0, 1800) : "按该电影风格的构图、材质、光线和剪辑节奏处理。") +
        "\n只学手法，不要照抄参考内容；仍然必须让每句歌词有具体画面。";
    }
    return base;
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
        { role: "system", content: "你是 CodeMV 的 Canvas 分镜程序员。严格按用户提示词里的 API 和语法规则，只输出可直接运行的函数体代码，不要解释、不要 markdown。" },
        { role: "user", content: buildPrompt() }
      ]);
      var code = clean(text);
      if (code.length < 20) throw new Error("模型返回为空");
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
