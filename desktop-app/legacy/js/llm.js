/* ==========================================================================
   CodeMV · 大模型接口（OpenAI 兼容）
   --------------------------------------------------------------------------
   • 只调用用户自己填的接口地址（OpenAI / DeepSeek / 通义 / 本地 Ollama 都行）
   • Key 只存在浏览器 localStorage，不经过任何第三方
   • 如果没有配置，就继续用「复制提示词」的手动流程
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var KEY = "codemv.llm";

  function load() {
    try {
      return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function save(cfg) {
    window.localStorage.setItem(KEY, JSON.stringify(cfg || {}));
  }

  function isConfigured(cfg) {
    cfg = cfg || load();
    return !!(cfg.base && cfg.model);
  }

  /**
   * 生成分镜：返回模型输出的文本（应当是 JSON）
   * prompt: 由 NS.script.buildPrompt 生成的提示词
   */
  function generate(prompt) {
    var cfg = load();
    var base = String(cfg.base || "").replace(/\/+$/, "");

    if (!base) return Promise.reject(new Error("请先在「模型设置」里填写 API 地址"));
    if (!cfg.model) return Promise.reject(new Error("请填写模型名称"));

    var headers = { "Content-Type": "application/json" };
    if (cfg.key) headers.Authorization = "Bearer " + cfg.key;

    var body = {
      model: cfg.model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "你是 MV 视觉导演。你只输出合法的 JSON 对象，不输出解释、不输出 markdown 代码块。"
        },
        { role: "user", content: prompt }
      ]
    };

    return fetch(base + "/chat/completions", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error("HTTP " + res.status + " " + text.slice(0, 200));
          });
        }
        return res.json();
      })
      .then(function (data) {
        var choice = data && data.choices && data.choices[0];
        var msg = choice && choice.message;
        var content =
          (msg && (msg.content || (Array.isArray(msg.content) ? msg.content.map(function (p) { return p.text; }).join("") : ""))) ||
          (choice && choice.text) ||
          "";

        if (!content) throw new Error("模型返回为空");
        return content;
      });
  }

  NS.llm = {
    load: load,
    save: save,
    isConfigured: isConfigured,
    generate: generate
  };
})(window.CodeMV);
