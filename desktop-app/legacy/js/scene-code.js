/* ==========================================================================
   CodeMV · AI 场景代码管理
   --------------------------------------------------------------------------
   流程：
     1. buildPrompt() 生成提示词 → 让大模型写 drawScene 代码
     2. start({ code, ... })  → 优先丢进 Worker 沙箱自检（8s 超时）
     3. 自检通过后逐帧渲染；失败/超时 → 回退到「歌词情景」引擎
     4. request(t) 取帧：Worker 模式异步回传 ImageBitmap；降级模式同步出画布

   安全边界：
     • Worker：AI 代码完全在主线程之外，可被 terminate
     • file:// 下浏览器可能禁用 Worker → 自动降级主线程执行（提示用户用 node server.js）
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var state = {
    worker: null,
    mode: "idle", // idle | booting | ready | failed
    fn: null,
    ctx: null,
    canvas: null,
    cfg: null,
    W: 0,
    H: 0,
    pending: false,
    timer: 0,
    checked: 0,
    errors: [],
    validated: false,
    onFrame: null,
    onState: null
  };

  function emit(mode, info) {
    state.mode = mode;
    if (mode !== "ready") state.pending = false;
    if (typeof state.onState === "function") state.onState(mode, info || {});
  }

  function buildTimes(duration) {
    var d = duration || 10;
    return [
      0,
      d * 0.1,
      d * 0.22,
      d * 0.35,
      d * 0.5,
      d * 0.65,
      d * 0.78,
      d * 0.9,
      Math.max(0, d - 0.2)
    ];
  }

  function buildCfg(input) {
    var p = input.palette || {};

    return {
      palette: {
        deep: p.deep || p[0] || [6, 8, 18],
        primary: p.primary || p[1] || [110, 231, 255],
        accent: p.accent || p[2] || [167, 139, 250],
        light: p.light || p[3] || [245, 248, 255]
      },
      sections: input.sections || [],
      lines: input.lines || [],
      duration: input.duration || 0,
      fps: input.fps || 30,
      features: input.features || null
    };
  }

  function stopWorker() {
    if (state.worker) {
      try {
        state.worker.terminate();
      } catch (e) {
        /* ignore */
      }
      state.worker = null;
    }
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = 0;
    }
  }

  function stop() {
    stopWorker();
    state.fn = null;
    state.ctx = null;
    state.canvas = null;
    state.pending = false;
    state.mode = "idle";
    state.errors = [];
    state.checked = 0;
    state.validated = false;
  }

  /* ---------- 主线程降级 ---------- */

  function startMainThread(input, times) {
    if (!NS.SceneCore) {
      state.errors.push("缺少 SceneCore，无法降级执行");
      emit("failed", { sandbox: "main", errors: state.errors });
      return false;
    }

    try {
      var canvas = document.createElement("canvas");
      canvas.width = state.W;
      canvas.height = state.H;
      var ctx = canvas.getContext("2d");

      var res = NS.SceneCore.probe(ctx, state.W, state.H, state.cfg, input.code, {
        times: times
      });

      if (!res.ok) {
        state.errors = state.errors.concat(res.errors);
        emit("failed", { sandbox: "main", errors: state.errors });
        return false;
      }

      state.fn = res.fn;
      state.ctx = ctx;
      state.canvas = canvas;
      state.checked = res.checked;
      state.validated = false;
      emit("ready", { sandbox: "main", checked: res.checked, elapsed: 0 });
      return true;
    } catch (err) {
      state.errors.push(String((err && err.message) || err));
      emit("failed", { sandbox: "main", errors: state.errors });
      return false;
    }
  }

  /* ---------- 代码清理（本地自动修复常见语法/格式问题） ---------- */
  function sanitize(code) {
    var s = String(code == null ? "" : code).trim();
    if (!s) return s;
    var fence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
    if (s.indexOf(fence) === 0) {
      s = s.replace(new RegExp("^" + String.fromCharCode(96) + "{3}[a-zA-Z]*[ \\t]*\\n?"), "");
    }
    var endFence = fence;
    if (s.slice(-3) === endFence) s = s.slice(0, -3);
    /* 中文标点 → 英文 */
    s = s.replace(/[“”]/g, String.fromCharCode(34));
    s = s.replace(/[‘’]/g, String.fromCharCode(39));
    s = s.replace(/（/g, "(").replace(/）/g, ")");
    s = s.replace(/；/g, ";").replace(/：/g, ":").replace(/，/g, ",");
    /* 去掉 import/export 行 */
    s = s.replace(/^[ \t]*(import|export)\b[^\n]*$/gm, "");
    s = s.replace(/\basync\s+function/g, "function");
    s = s.replace(/\bawait\s+/g, "");
    /* 括号补齐（只补少量） */
    var round = 0, curly = 0, square = 0, inStr = false, strCh = "", esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === strCh) inStr = false;
        continue;
      }
      if (ch === String.fromCharCode(34) || ch === String.fromCharCode(39)) { inStr = true; strCh = ch; continue; }
      if (ch === "(") round++;
      else if (ch === ")") round--;
      else if (ch === "{") curly++;
      else if (ch === "}") curly--;
      else if (ch === "[") square++;
      else if (ch === "]") square--;
    }
    var tail = "";
    if (round > 0 && round <= 8) { for (var r = 0; r < round; r++) tail += ")"; }
    if (square > 0 && square <= 8) { for (var q = 0; q < square; q++) tail += "]"; }
    if (curly > 0 && curly <= 8) { for (var c = 0; c < curly; c++) tail += "}"; }
    if (tail) s = s + "\n" + tail;
    return s;
  }

  /* ---------- 启动 ---------- */

  function start(input) {
    input.code = sanitize(input.code);
    stop();

    state.W = input.width || 1600;
    state.H = input.height || 900;
    state.cfg = buildCfg(input);
    state.onFrame = input.onFrame || null;
    state.onState = input.onState || null;

    var times = buildTimes(state.cfg.duration);

    try {
      var worker = new Worker("js/scene-worker.js");
      state.worker = worker;

      worker.onmessage = function (e) {
        var msg = e.data || {};

        if (msg.type === "boot") {
          if (typeof state.onState === "function") {
            state.onState("boot", { sandbox: "worker", hasCore: msg.hasCore });
          }
          return;
        }

        if (msg.type === "phase") {
          if (typeof state.onState === "function") {
            state.onState("phase", { sandbox: "worker", phase: msg.phase, t: msg.t });
          }
          return;
        }

        if (msg.type === "ready") {
          window.clearTimeout(state.timer);
          state.timer = 0;
          state.checked = msg.checked || 0;

          /* Worker 只负责校验；编译一步在主线程再做一次，用于同步渲染 */
          try {
            state.fn = NS.SceneCore.compile(input.code);
            state.canvas = document.createElement("canvas");
            state.canvas.width = state.W;
            state.canvas.height = state.H;
            state.ctx = state.canvas.getContext("2d");
            if (!state.ctx) throw new Error("无法创建离屏画布");
          } catch (err) {
            state.errors = [String((err && err.message) || err)];
            stopWorker();
            emit("failed", { sandbox: "worker", errors: state.errors });
            return;
          }

          state.validated = true;
          emit("ready", {
            sandbox: "worker",
            checked: state.checked,
            elapsed: msg.elapsed || 0
          });
          return;
        }

        if (msg.type === "fail") {
          window.clearTimeout(state.timer);
          stopWorker();
          state.errors = msg.errors || [];
          emit("failed", { sandbox: "worker", errors: state.errors });
          return;
        }

        if (msg.type === "frame") {
          state.pending = false;
          if (typeof state.onFrame === "function") {
            state.onFrame(msg.bitmap, msg.t);
          } else if (msg.bitmap && msg.bitmap.close) {
            msg.bitmap.close();
          }
          return;
        }

        if (msg.type === "error") {
          state.pending = false;
          state.errors = [msg.message];
          emit("failed", { sandbox: "worker", errors: state.errors });
        }
      };

      worker.onerror = function (evt) {
        window.clearTimeout(state.timer);
        stopWorker();
        state.errors = [evt && evt.message ? evt.message : "Worker 运行失败"];
        startMainThread(input, times);
      };

      worker.postMessage({
        type: "init",
        code: input.code,
        W: state.W,
        H: state.H,
        cfg: state.cfg,
        times: times
      });

      state.timer = window.setTimeout(function () {
        stopWorker();
        state.errors = [
          "自检超时（" + Math.round((input.timeout || 8000) / 1000) + "s）：代码可能陷入死循环，已终止 Worker"
        ];
        emit("failed", { sandbox: "worker", errors: state.errors });
      }, input.timeout || 8000);

      emit("booting", { sandbox: "worker" });
      return true;
    } catch (err) {
      /* file:// 等环境禁止 Worker → 主线程降级 */
      state.errors = [
        "Worker 不可用（" + ((err && err.message) || err) + "），已降级为主线程执行，安全性降低"
      ];
      return startMainThread(input, times);
    }
  }

  /* ---------- 取帧（同步，主线程渲染） ---------- */

  function request(t) {
    if (state.mode !== "ready") return false;

    if (!state.fn || !state.ctx) return false;

    NS.SceneCore.renderFrame(
      state.ctx,
      state.W,
      state.H,
      state.cfg,
      state.fn,
      t,
      false
    );

    return true;
  }

  function getCanvas() {
    return state.canvas;
  }

  function isReady() {
    return state.mode === "ready";
  }

  function mode() {
    return state.mode;
  }

  function sandbox() {
    if (state.mode !== "ready") return "none";
    return state.validated ? "worker" : "main";
  }

  function errors() {
    return state.errors;
  }

  /* ======================================================================
     提示词
     ====================================================================== */

  function buildPrompt(input) {
    var lines = input.lines || [];
    var duration = input.duration || 0;
    var sections = input.sections || [];

    var sectionDump = sections
      .map(function (s) {
        return (
          s.start.toFixed(1) +
          "-" +
          s.end.toFixed(1) +
          "s  hint=" +
          (s.hint || "")
        );
      })
      .join("\n");

    var lyricDump = lines
      .map(function (l) {
        return l.time.toFixed(1) + "  " + l.text;
      })
      .join("\n");

    return [
      "你是一位把「歌词」翻译成「画面」的分镜师 + Canvas 程序员。",
      "最终会逐帧渲染成一支歌词 MV —— 每一句歌词都要有属于它自己的画面。",
      "",
      "【第一原则：画面内容必须来自歌词，而不是通用动态背景】",
      "1. 先读懂每句歌词在说什么（人物 / 场景 / 动作 / 情绪 / 意象），再决定画什么。",
      "2. 每一句歌词至少对应一个具体、可辨认的元素（物体 / 场景 / 动作 / 光影），",
      "   并且你能指出它对应歌词里的哪个词。",
      "3. 相邻两句之间，画面至少改变一项：主体 / 场景 / 构图 / 主色 / 光线。",
      "   只有字幕变、背景几乎不动的做法视为失败。",
      "4. 允许抽象、超现实拼贴、多材质叠加；不必每句都写实，但必须能解释它来自哪句歌词的哪个词。",
      "5. 分镜 hint 必须真的影响画面：不同分镜要有不同的景别、构图或色调。",
      "6. 避免陈词滥调堆砌（月亮+海+雨一整首）：同一意象最多连续出现 2 句，之后必须换场景。",
      "",
      "【第一步：先在心里做分镜表（不要输出表格）】",
      "逐句写出：歌词关键词 → 具体画面（主体 + 环境 + 材质 + 主色 + 光线 + 构图）→ 用什么运动表达。",
      "不确定时优先选「能画出来的具体物件」，不要停留在空泛的情绪词。",
      "",
      "【画面示例（只示意思路，禁止照抄这些意象）】",
      "  「灯火把影子拉长」→ 路灯 + 被拉长的人影 + 暖黄光 + 低机位长构图",
      "  「我听见城市的呼吸」→ 楼群剪影 + 通风口蒸汽 + 冷蓝夜色 + 缓慢升镜",
      "  「像潮水涌向月亮」→ 潮水 + 月亮倒影 + 横向推镜 + 波光",
      "  「如果风也会记得」→ 被风卷起的纸片 + 风的轨迹线 + 仰拍",
      "  「请把我的名字带走」→ 沙上写字被浪抹平 / 墨迹被水冲散 + 退镜",
      "",
      "【硬性要求】",
      "1. 只输出代码，不要 markdown 代码块、不要解释文字。",
      "2. 语法硬要求（违反会直接运行失败）：",
      "   • 只输出函数体，运行方式相当于 (function(ctx, f) { 你的代码 })。",
      "   • 禁止 import / export / async / await / 可选链 ?. / 空值合并 ?? / 类字段语法。",
      "   • 所有括号必须成对闭合；每行语句以分号结尾；字符串用英文单/双引号，禁止中文引号。",
      "   • 不要输出 markdown 代码块、注释以外的解释文字；注释可以少写。",
      "   • 输出前在脑内用 new Function('ctx','f', code) 编译一遍，确认无语法错误。",
      "   也可以写成 function drawScene(ctx, f) { ... }，引擎会自动调用。",
      "3. 画面必须完全由 f.t（当前秒数）决定：禁止 Math.random、Date、setTimeout，",
      "   禁止用全局变量保存帧间状态。需要随机感请用 f.hash(i)。",
      "4. 禁止网络请求（fetch / XHR / WebSocket 已被禁用）。",
      "5. 每一帧都要自己铺满整个背景，尺寸用 f.W / f.H。",
      "6. 不要画歌词文字本身，引擎会在最上层自动叠加歌词。",
      "7. 单帧绘制控制在 300 次以内，避免卡顿。",
      "",
      "【可用 API】（都在 f 上）",
      "  f.t  f.W  f.H  f.duration  f.fps",
      "  f.pal.deep / f.pal.primary / f.pal.accent / f.pal.light    // RGB 数组",
      "  f.line = { text, age, dur, alpha, progress, index, count }  // 当前歌词",
      "  f.section = { start, end, hint }                             // 当前分镜",
      "  f.energy  f.bass  f.beatPhase(0~1)  f.beatIndex  f.pulse()",
      "  f.energyAt(t)  f.bassAt(t)",
      "  f.hash(i)  f.rand(i)  f.hash2(a,b)",
      "  f.clamp(a,lo,hi)  f.lerp(a,b,k)  f.smoothstep(a,b,x)  f.easeOut(k)  f.backOut(k)",
      "  f.seg(a,b)  →  t 在 [a,b] 内的进度 0~1",
      "  f.kf([[t,v],[t,v],...])  →  关键帧插值",
      "  f.rgb(color, alpha)   f.mix(colorA, colorB, k)",
      "  f.gradient(x0,y0,x1,y1, [[stop,color,alpha],...])",
      "  f.radial(cx,cy,r, [[stop,color,alpha],...])",
      "  f.fill(color)",
      "  f.rect(x,y,w,h,color,alpha)   f.roundRect(x,y,w,h,r,color,alpha)",
      "  f.circle(x,y,r,color,alpha)   f.ellipse(x,y,rx,ry,color,alpha)",
      "  f.line(x1,y1,x2,y2,color,width,alpha)",
      "  f.path(points, {stroke,fill,width,closed,smooth})   // points = [[x,y],...]",
      "  f.glow(x,y,r,color,alpha)",
      "  f.text(str,x,y,{size,color,alpha,weight,glow,align})",
      "  f.camera(cx,cy,zoom,rot,fn)   // 镜头推拉摇移",
      "  f.vignette(strength)   f.noise(count,{color,alpha,size})",
      "  ctx 是原生 CanvasRenderingContext2D，也可以直接使用",
      "",
      "【分镜】",
      sectionDump || "（无）",
      "",
      "【歌词（时间戳，秒）】",
      lyricDump || "（无歌词）",
      "",
      "【让画面有生命（在内容正确之后，再叠加这些表现手段）】",
      "• 每个分镜至少一种镜头运动（缓推 3%~8% / 平移 / 手持轻微抖动 / 拉远）；用 f.camera 做视差分层。",
      "• 每层有缓慢呼吸 / 漂移 / 明暗变化，不同元素相位不同（用 f.hash 取种子）。",
      "• 入场用 f.easeOut / f.backOut（可 5%~10% 过冲），出场 easeIn，禁止线性。",
      "• 音频反应克制：f.bass 驱动镜头微推或主体缩放，f.energy 驱动亮度，幅度 <8%。",
      "• 分镜边界做设计过的转场（推镜 / 擦除 / 形变 / 元素穿越），不要只做透明度交叉。",
      "• 至少两种质感层（颗粒 / 暗角 / 扫描线 / 纸纹 / 半调）。",
      "",
      "【交卷前自检（必须做）】",
      "1. 逐句问：这句画面和上一句相比，主体 / 场景 / 构图 / 色调变了吗？没变就重写。",
      "2. 如果去掉所有呼吸、漂移、闪烁，画面还成立吗？不成立说明内容不够。",
      "3. 每句画面能否用一句话说出「这句在画什么」？说不出就是空泛背景。",
      "4. 画面里的具体元素，能否对应到歌词里的某几个词？不能就删掉或替换。",
      "",
      "歌曲时长：" + duration.toFixed(1) + " 秒。",
      "",
      "【最小可运行示例（照这个结构写，不要照抄内容）】",
      "  ctx.fillStyle = f.rgb(f.pal.deep, 1); ctx.fillRect(0, 0, f.W, f.H);",
      "  var p = f.seg(f.line.startTime || 0, f.line.endTime || f.duration);",
      "  f.ellipse(f.W * 0.5, f.H * 0.7, f.W * 0.3, f.H * 0.06, f.pal.accent, 0.2 + 0.2 * p);",
      "  f.line(f.W * 0.2, f.H * 0.5, f.W * 0.8, f.H * 0.5, f.pal.light, 2, 0.5);",
      "",
      "请写一段完整、可运行的代码：每句歌词都有自己具体的画面（不是换字幕），",
      "每句之间有内容上的推进，镜头和运动用来表达这些内容。"
    ].join("\n");
  }

  /* ======================================================================
     示例代码（没有大模型时也能体验「AI 写画面」）
     ====================================================================== */

  var SAMPLE_CODE = [
  "// 示例：6 句歌词 = 6 个具体画面",
  "// 窗前夜色 → 路灯长影 → 城市呼吸 → 潮水月亮 → 风与纸片 → 名字被水带走",
  "var W = f.W, H = f.H, t = f.t, pal = f.pal;",
  "var line = f.line;",
  "var idx = line ? line.index : 0;",
  "var lp = line ? f.clamp(line.age / Math.max(0.5, line.dur), 0, 1) : 1;",
  "var breath = 1 + Math.sin(t * 0.5) * 0.008;",
  "var pulse = f.pulse();",
  "var camX = Math.sin(t * 0.1) * W * 0.006;",
  "var camY = Math.cos(t * 0.09) * H * 0.004;",
  "",
  "/* ---- 第 1 句：夜色落在窗前 ---- */",
  "function s0(a) {",
  "  f.fill([8, 10, 24]);",
  "  for (var i = 0; i < 42; i++) f.circle(f.hash(i * 3.1) * W, f.hash(i * 7.7) * H * 0.55, 0.8 + f.hash(i) * 1.3, pal.light, (0.12 + Math.abs(Math.sin(t + i)) * 0.3) * a);",
  "  var mx = W * 0.72, my = H * 0.2;",
  "  f.glow(mx, my, H * (0.15 + 0.015 * pulse), pal.light, 0.3 * a);",
  "  f.circle(mx, my, H * 0.05 * breath, [246, 248, 255], a);",
  "  ctx.save();",
  "  ctx.strokeStyle = f.rgb(pal.deep, 0.95 * a);",
  "  ctx.lineWidth = Math.max(6, W * 0.012);",
  "  ctx.strokeRect(W * 0.08, H * 0.1, W * 0.36, H * 0.66);",
  "  ctx.beginPath();",
  "  ctx.moveTo(W * 0.26, H * 0.1); ctx.lineTo(W * 0.26, H * 0.76);",
  "  ctx.moveTo(W * 0.08, H * 0.43); ctx.lineTo(W * 0.44, H * 0.43);",
  "  ctx.stroke();",
  "  ctx.restore();",
  "}",
  "",
  "/* ---- 第 2 句：灯火把影子拉长 ---- */",
  "function s1(a) {",
  "  f.fill([10, 8, 7]);",
  "  f.rect(0, H * 0.72, W, H * 0.28, [18, 16, 14], a);",
  "  f.path([[W * 0.72, H * 0.18], [W * 0.55, H * 0.78], [W * 0.9, H * 0.78]], { fill: f.rgb(pal.accent, 0.1 * a), closed: true });",
  "  f.circle(W * 0.72, H * 0.16, H * (0.016 + 0.01 * pulse), pal.accent, 0.9 * a);",
  "  f.line(W * 0.72, H * 0.18, W * 0.72, H * 0.74, [30, 26, 22], W * 0.006, a);",
  "  f.ellipse(W * 0.46, H * 0.74, W * 0.028, H * (0.1 + 0.02 * Math.sin(t * 0.8)), [12, 10, 10], 0.85 * a);",
  "  f.line(W * 0.46, H * 0.63, W * 0.5, H * 0.72, [12, 10, 10], W * 0.008, a);",
  "}",
  "",
  "/* ---- 第 3 句：我听见城市的呼吸 ---- */",
  "function s2(a) {",
  "  f.fill([6, 10, 18]);",
  "  for (var i = 0; i < 9; i++) {",
  "    var bx = W * (0.06 + i * 0.11);",
  "    var bh = H * (0.18 + f.hash(i * 5.3) * 0.42);",
  "    f.rect(bx, H * 0.78 - bh, W * 0.075, bh, [14, 18, 30], a);",
  "  }",
  "  for (var j = 0; j < 5; j++) {",
  "    var sx = W * (0.2 + j * 0.14);",
  "    var sy = H * 0.42 - f.hash(j) * H * 0.18;",
  "    var ph = (t * 0.18 + j * 0.27) % 1;",
  "    f.circle(sx + Math.sin(t + j) * W * 0.012, sy - ph * H * 0.26, W * (0.02 + ph * 0.05), pal.light, (1 - ph) * 0.16 * a);",
  "  }",
  "  f.glow(W * 0.5, H * 0.5, W * 0.5, pal.primary, (0.1 + 0.05 * Math.sin(t * 1.2)) * a);",
  "}",
  "",
  "/* ---- 第 4 句：像潮水涌向月亮 ---- */",
  "function s3(a) {",
  "  f.fill([4, 10, 22]);",
  "  var my = H * 0.24;",
  "  f.glow(W * 0.5, my, H * 0.18, pal.light, 0.3 * a);",
  "  f.circle(W * 0.5, my, H * 0.05, [246, 248, 255], a);",
  "  for (var i = 0; i < 12; i++) {",
  "    var ry = H * 0.5 + i * H * 0.035;",
  "    var rw = W * (0.14 - i * 0.008);",
  "    f.rect(W * 0.5 - rw / 2 + Math.sin(t * 1.5 + i) * W * 0.004, ry, rw, H * 0.012, pal.light, (0.22 - i * 0.015) * a * breath);",
  "  }",
  "  ctx.save();",
  "  for (var w = 0; w < 4; w++) {",
  "    var yy = H * (0.55 + w * 0.1);",
  "    ctx.beginPath();",
  "    ctx.moveTo(0, yy);",
  "    for (var x2 = 0; x2 <= W; x2 += W / 24) ctx.lineTo(x2, yy + Math.sin((x2 / W) * 5 + t * (1.2 + w * 0.2) + w) * H * 0.02);",
  "    ctx.strokeStyle = f.rgb(pal.light, (0.28 - w * 0.05) * a);",
  "    ctx.lineWidth = H * 0.006;",
  "    ctx.stroke();",
  "  }",
  "  ctx.restore();",
  "}",
  "",
  "/* ---- 第 5 句：如果风也会记得 ---- */",
  "function s4(a) {",
  "  f.fill([10, 14, 16]);",
  "  ctx.save();",
  "  for (var i = 0; i < 6; i++) {",
  "    ctx.beginPath();",
  "    for (var x3 = 0; x3 <= W; x3 += W / 20) {",
  "      var y3 = H * (0.14 + i * 0.13) + Math.sin((x3 / W) * 4 + t * 1.3 + i) * H * 0.03;",
  "      if (x3 === 0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3);",
  "    }",
  "    ctx.strokeStyle = f.rgb(pal.accent, 0.12 * a);",
  "    ctx.lineWidth = 1.5;",
  "    ctx.stroke();",
  "  }",
  "  ctx.restore();",
  "  for (var p2 = 0; p2 < 8; p2++) {",
  "    var px = (f.hash(p2 * 3.3) * W + t * (40 + f.hash(p2) * 55)) % W;",
  "    var py = H * (0.2 + f.hash(p2 * 7.7) * 0.55) + Math.sin(t * 2 + p2) * H * 0.03;",
  "    f.rect(px, py, W * 0.012, H * 0.014, pal.light, 0.45 * a);",
  "  }",
  "}",
  "",
  "/* ---- 第 6 句：请把我的名字带走 ---- */",
  "function s5(a) {",
  "  f.fill([8, 12, 20]);",
  "  f.rect(0, H * 0.62, W, H * 0.38, [22, 20, 16], a);",
  "  ctx.save();",
  "  for (var i = 0; i < 3; i++) {",
  "    var wy = H * (0.6 + i * 0.08);",
  "    ctx.beginPath();",
  "    ctx.moveTo(0, wy);",
  "    for (var x4 = 0; x4 <= W; x4 += W / 24) ctx.lineTo(x4, wy + Math.sin((x4 / W) * 6 - t * (1 + i * 0.3)) * H * 0.012);",
  "    ctx.strokeStyle = f.rgb(pal.light, 0.2 * a);",
  "    ctx.lineWidth = 2;",
  "    ctx.stroke();",
  "  }",
  "  ctx.restore();",
  "  var fade = f.clamp(1 - ((t % 13) / 10), 0.12, 1);",
  "  for (var k = 0; k < 5; k++) {",
  "    var kx = W * (0.24 + k * 0.1);",
  "    f.line(kx, H * 0.62, kx + Math.sin(k * 1.7) * W * 0.02, H * 0.5 - k * H * 0.005, pal.light, W * 0.004, 0.5 * fade * a);",
  "  }",
  "}",
  "",
  "function drawSceneByIndex(i, a) {",
  "  var m = ((i % 6) + 6) % 6;",
  "  if (m === 0) s0(a);",
  "  else if (m === 1) s1(a);",
  "  else if (m === 2) s2(a);",
  "  else if (m === 3) s3(a);",
  "  else if (m === 4) s4(a);",
  "  else s5(a);",
  "}",
  "",
  "/* 镜头呼吸 + 视差；新句前 0.4s 旧场景淡出，形成内容转场 */",
  "f.camera(W / 2 + camX, H / 2 + camY, breath, 0, function () {",
  "  drawSceneByIndex(idx, 1);",
  "  if (lp < 0.4 && line && line.index > 0) {",
  "    ctx.save();",
  "    ctx.globalAlpha = 1 - lp / 0.4;",
  "    drawSceneByIndex(idx - 1, 1);",
  "    ctx.restore();",
  "  }",
  "});",
  "",
  "/* 质感层 + 节拍暗角 */",
  "f.noise(90, { color: [255, 255, 255], alpha: 0.02, size: 1 });",
  "f.vignette(0.6 - 0.06 * pulse);"
].join("\n");

  NS.sceneCode = {
    start: start,
    request: request,
    stop: stop,
    isReady: isReady,
    mode: mode,
    sandbox: sandbox,
    getCanvas: getCanvas,
    errors: errors,
    checked: function () {
      return state.checked;
    },
    buildPrompt: buildPrompt,
    SAMPLE_CODE: SAMPLE_CODE
  };
})(window.CodeMV);
