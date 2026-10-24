/* ==========================================================================
   CodeMV · 场景代码校验 Worker
   --------------------------------------------------------------------------
   职责收窄为「只校验、不渲染」：
     • 编译 AI 代码
     • 在多个时间点各跑两遍，比对绘制调用序列（确定性自检）
     • 任一环节死循环 → 主线程 terminate() 掉它
   渲染放在主线程同步完成，好处是：
     • 不依赖 Worker 里的 OffscreenCanvas（部分环境不可靠）
     • 离线逐帧导出（WebCodecs）也能正常拿到同步帧
   ========================================================================== */

importScripts("scene-core.js");

self.postMessage({
  type: "boot",
  hasCore: typeof self.SceneCore !== "undefined"
});

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === "init") onInit(msg);
  else if (msg.type === "dispose") self.close();
};

function now() {
  return self.performance && self.performance.now ? self.performance.now() : 0;
}

function onInit(msg) {
  var started = now();

  try {
    var result = self.SceneCore.probeTranscript(
      msg.W,
      msg.H,
      msg.cfg,
      msg.code,
      msg.times
    );

    if (!result.ok) {
      self.postMessage({ type: "fail", errors: result.errors });
      return;
    }

    self.postMessage({
      type: "ready",
      checked: result.checked,
      elapsed: Math.round(now() - started)
    });
  } catch (err) {
    self.postMessage({
      type: "fail",
      errors: [String((err && err.message) || err)]
    });
  }
}
