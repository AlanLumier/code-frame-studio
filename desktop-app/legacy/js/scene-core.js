/* ==========================================================================
   CodeMV · AI 场景代码运行时（共享核心）
   --------------------------------------------------------------------------
   这个文件同时被两处使用：
     1. js/scene-worker.js  —— 在 Web Worker 里执行 AI 生成的代码（安全沙箱 + 超时）
     2. 主线程降级模式       —— file:// 下无法创建 Worker 时，主线程 try/catch 执行

   它负责三件事：
     A. 给 AI 提供一套「画布 API」（形状 / 渐变 / 文字 / 镜头 / 节拍 / 稳定随机）
     B. 编译 AI 代码，并屏蔽网络、随机数、定时器等不确定/危险能力
     C. 自检：同一时间点渲染两次，比较像素哈希，确保画面是 t 的纯函数
   ========================================================================== */

(function (root) {
  "use strict";

  /* ---------- 安全 Math（禁用 random） ---------- */

  function safeMath() {
    var M = Object.create(Math);
    M.random = function () {
      throw new Error("禁止 Math.random()，请用 f.hash(i) 生成稳定随机");
    };
    return M;
  }

  /* ---------- 颜色 ---------- */

  function rgbOf(hex) {
    if (Array.isArray(hex)) return hex;
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(c, a) {
    if (typeof c === "string" && /^rgba?\(/i.test(c.trim())) return c;
    var v = rgbOf(c);
    return "rgba(" + v[0] + "," + v[1] + "," + v[2] + "," + (a == null ? 1 : a) + ")";
  }

  function mixColor(a, b, k) {
    var A = rgbOf(a);
    var B = rgbOf(b);
    return [
      Math.round(A[0] + (B[0] - A[0]) * k),
      Math.round(A[1] + (B[1] - A[1]) * k),
      Math.round(A[2] + (B[2] - A[2]) * k)
    ];
  }

  /* ---------- 缓动 ---------- */

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function smoothstep(a, b, x) {
    var k = clamp((x - a) / (b - a || 1), 0, 1);
    return k * k * (3 - 2 * k);
  }

  function easeOut(k) {
    return 1 - Math.pow(1 - k, 3);
  }

  function backOut(k) {
    var c = 1.70158;
    var p = k - 1;
    return 1 + (c + 1) * p * p * p + c * p * p;
  }

  /* ---------- 稳定随机 ---------- */

  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  /* ---------- 采样音频特征 ---------- */

  function makeSampler(features) {
    if (!features || !features.energy) {
      return {
        energy: function () {
          return 0;
        },
        bass: function () {
          return 0;
        }
      };
    }

    function sample(arr, t) {
      var idx = (t * features.sampleRate) / features.hop;
      var i0 = Math.floor(idx);
      if (i0 < 0) return arr[0] || 0;
      if (i0 >= arr.length - 1) return arr[arr.length - 1] || 0;
      var k = idx - i0;
      return arr[i0] * (1 - k) + arr[i0 + 1] * k;
    }

    return {
      energy: function (t) {
        return sample(features.energy, t);
      },
      bass: function (t) {
        return sample(features.bass, t);
      }
    };
  }

  /* ---------- 节拍 ---------- */

  function beatPhaseAt(features, t) {
    if (!features) return (t * 2) % 1;

    var beatLen = features.bpm > 0 ? 60 / features.bpm : 0.5;
    var beats = features.beats;

    if (beats && beats.length > 2) {
      var lo = 0;
      var hi = beats.length - 1;
      var idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (beats[mid] <= t) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (idx >= 0 && idx < beats.length - 1) {
        var span = beats[idx + 1] - beats[idx];
        if (span > 0.1 && span < 2) return (t - beats[idx]) / span;
      }
    }
    return (t / beatLen) % 1;
  }

  /* ---------- 歌词 ---------- */

  function lineAt(lines, t, duration) {
    if (!lines || !lines.length) return null;

    var lo = 0;
    var hi = lines.length - 1;
    var idx = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].time <= t) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx < 0) return null;

    var cur = lines[idx];
    var next = lines[idx + 1];
    var end = next ? Math.min(next.time, duration) : duration;
    var age = t - cur.time;
    var dur = Math.max(0.4, end - cur.time);

    return {
      text: cur.text,
      index: idx,
      count: lines.length,
      start: cur.time,
      end: end,
      age: age,
      dur: dur,
      alpha: clamp(age / 0.45, 0, 1) * clamp((end - t) / 0.35, 0, 1),
      progress: clamp(age / dur, 0, 1)
    };
  }

  function sectionAt(sections, t) {
    if (!sections || !sections.length) return null;
    var found = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].start <= t) found = sections[i];
      else break;
    }
    return found;
  }

  /* ======================================================================
     构建每帧的 API 对象 f
     ====================================================================== */

  function makeFrame(ctx, W, H, cfg, t) {
    var pal = cfg.palette || {};
    var sampler = cfg.sampler || makeSampler(cfg.features);
    var features = cfg.features;
    var phase = beatPhaseAt(features, t);

    var f = {
      /* 基础 */
      t: t,
      W: W,
      H: H,
      duration: cfg.duration,
      fps: cfg.fps || 30,

      /* 调色 */
      pal: {
        deep: pal.deep || [6, 8, 18],
        primary: pal.primary || [110, 231, 255],
        accent: pal.accent || [167, 139, 250],
        light: pal.light || [245, 248, 255]
      },

      /* 分镜 / 歌词 */
      section: sectionAt(cfg.sections, t),
      line: lineAt(cfg.lines, t, cfg.duration),

      /* 音频特征 */
      energy: sampler.energy(t),
      bass: sampler.bass(t),
      beatPhase: phase,
      beatIndex: cfg.features && cfg.features.bpm > 0
        ? t / (60 / cfg.features.bpm)
        : t * 2,
      energyAt: function (x) {
        return sampler.energy(x);
      },
      bassAt: function (x) {
        return sampler.bass(x);
      },

      /* 节拍脉冲：拍点上 1，之后快速衰减 */
      pulse: function () {
        return Math.pow(1 - phase, 3);
      },

      /* 稳定随机 */
      hash: hash,
      rand: function (n) {
        return hash(n);
      },
      hash2: function (a, b) {
        return hash(a * 127.1 + b * 311.7);
      },

      /* 数学 */
      clamp: clamp,
      lerp: lerp,
      smoothstep: smoothstep,
      easeOut: easeOut,
      backOut: backOut,

      /* 区间进度 / 关键帧插值 */
      seg: function (a, b) {
        return clamp((t - a) / (b - a || 1), 0, 1);
      },
      kf: function (list) {
        if (!list || !list.length) return 0;
        if (t <= list[0][0]) return list[0][1];
        for (var i = 0; i < list.length - 1; i++) {
          var a = list[i];
          var b = list[i + 1];
          if (t >= a[0] && t <= b[0]) {
            var k = (t - a[0]) / (b[0] - a[0] || 1);
            return lerp(a[1], b[1], smoothstep(0, 1, k));
          }
        }
        return list[list.length - 1][1];
      },

      /* 颜色 */
      rgb: function (c, a) {
        return rgba(c, a);
      },
      mix: mixColor,

      /* ---------- 绘制 ---------- */
      fill: function (c) {
        ctx.fillStyle = rgba(c, 1);
        ctx.fillRect(0, 0, W, H);
      },

      gradient: function (x0, y0, x1, y1, stops) {
        var g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (var i = 0; i < stops.length; i++) {
          g.addColorStop(clamp(stops[i][0], 0, 1), rgba(stops[i][1], stops[i][2]));
        }
        return g;
      },

      radial: function (cx, cy, r, stops) {
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
        for (var i = 0; i < stops.length; i++) {
          g.addColorStop(clamp(stops[i][0], 0, 1), rgba(stops[i][1], stops[i][2]));
        }
        return g;
      },

      rect: function (x, y, w, h, c, a) {
        ctx.fillStyle = rgba(c, a == null ? 1 : a);
        ctx.fillRect(x, y, w, h);
      },

      roundRect: function (x, y, w, h, r, c, a) {
        ctx.fillStyle = rgba(c, a == null ? 1 : a);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, w, h, r);
        } else {
          ctx.rect(x, y, w, h);
        }
        ctx.fill();
      },

      circle: function (x, y, r, c, a) {
        ctx.fillStyle = rgba(c, a == null ? 1 : a);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
        ctx.fill();
      },

      ellipse: function (x, y, rx, ry, c, a) {
        ctx.fillStyle = rgba(c, a == null ? 1 : a);
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
        ctx.fill();
      },

      line: function (x1, y1, x2, y2, c, w, a) {
        ctx.strokeStyle = rgba(c, a == null ? 1 : a);
        ctx.lineWidth = w || 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      },

      path: function (points, opts) {
        opts = opts || {};
        if (!points || !points.length) return;

        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);

        if (opts.smooth && points.length > 2) {
          for (var i = 1; i < points.length - 1; i++) {
            var xc = (points[i][0] + points[i + 1][0]) / 2;
            var yc = (points[i][1] + points[i + 1][1]) / 2;
            ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
          }
          var last = points[points.length - 1];
          ctx.lineTo(last[0], last[1]);
        } else {
          for (var j = 1; j < points.length; j++) {
            ctx.lineTo(points[j][0], points[j][1]);
          }
        }

        if (opts.closed) ctx.closePath();
        if (opts.fill) {
          ctx.fillStyle = rgba(opts.fill, opts.fillAlpha == null ? 1 : opts.fillAlpha);
          ctx.fill();
        }
        if (opts.stroke) {
          ctx.strokeStyle = rgba(opts.stroke, opts.strokeAlpha == null ? 1 : opts.strokeAlpha);
          ctx.lineWidth = opts.width || 1.5;
          ctx.stroke();
        }
      },

      glow: function (x, y, r, c, a) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
        g.addColorStop(0, rgba(c, a == null ? 0.5 : a));
        g.addColorStop(0.5, rgba(c, (a == null ? 0.5 : a) * 0.3));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
        ctx.fill();
      },

      text: function (str, x, y, opts) {
        opts = opts || {};
        ctx.save();
        ctx.textAlign = opts.align || "center";
        ctx.textBaseline = opts.baseline || "middle";
        ctx.font =
          (opts.weight || 500) +
          " " +
          (opts.size || 24) +
          "px " +
          (opts.font ||
            '"PingFang SC","Microsoft YaHei","Inter",system-ui,sans-serif');
        if (opts.glow) {
          ctx.shadowColor = rgba(opts.glow, 0.8);
          ctx.shadowBlur = (opts.size || 24) * 0.6;
        }
        ctx.fillStyle = rgba(opts.color || [255, 255, 255], opts.alpha == null ? 1 : opts.alpha);
        ctx.fillText(String(str), x, y);
        ctx.restore();
      },

      camera: function (cx, cy, zoom, rot, fn) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        if (rot) ctx.rotate(rot);
        if (zoom && zoom !== 1) ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);
        try {
          fn();
        } finally {
          ctx.restore();
        }
      },

      vignette: function (strength) {
        var k = strength == null ? 0.65 : strength;
        var g = ctx.createRadialGradient(
          W / 2, H / 2, Math.min(W, H) * 0.3,
          W / 2, H / 2, Math.max(W, H) * 0.75
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0," + k + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      },

      noise: function (count, opts) {
        opts = opts || {};
        for (var i = 0; i < count; i++) {
          var x = hash(i * 3.1 + 0.7) * W;
          var y = hash(i * 7.3 + 1.1) * H;
          ctx.fillStyle = rgba(opts.color || [255, 255, 255], opts.alpha || 0.3);
          ctx.fillRect(x, y, opts.size || 1.5, opts.size || 1.5);
        }
      }
    };

    return f;
  }

  /* ======================================================================
     编译 AI 代码
     ====================================================================== */

  var BLOCKED =
    "var fetch=null,XMLHttpRequest=null,WebSocket=null,importScripts=null," +
    "self=null,globalThis=null,postMessage=null,location=null,navigator=null," +
    "document=null,window=null,top=null,parent=null,frames=null," +
    "localStorage=null,sessionStorage=null,indexedDB=null,caches=null," +
    "Worker=null,SharedWorker=null,BroadcastChannel=null,WebAssembly=null," +
    "crypto=null,performance=null,Date=undefined," +
    "setTimeout=null,setInterval=null,requestAnimationFrame=null," +
    "Function=null,eval=undefined;\n";

  /* 静态扫描：先挡掉明显越权的代码，再编译执行 */
  var BANNED_PATTERNS = [
    { re: /\bfetch\s*\(/, name: "fetch" },
    { re: /XMLHttpRequest/, name: "XMLHttpRequest" },
    { re: /WebSocket/, name: "WebSocket" },
    { re: /importScripts/, name: "importScripts" },
    { re: /new\s+Worker/, name: "Worker" },
    { re: /\beval\s*\(/, name: "eval" },
    { re: /new\s+Function/, name: "Function 构造器" },
    { re: /\bdocument\b/, name: "document" },
    { re: /\bwindow\b/, name: "window" },
    { re: /localStorage/, name: "localStorage" },
    { re: /sessionStorage/, name: "sessionStorage" },
    { re: /indexedDB/, name: "indexedDB" },
    { re: /Math\.random/, name: "Math.random（请用 f.hash）" },
    { re: /\bDate\b/, name: "Date" },
    { re: /\bsetTimeout\b/, name: "setTimeout" },
    { re: /\bsetInterval\b/, name: "setInterval" }
  ];

  var MAX_CODE_LEN = 40000;

  function validateCode(code) {
    if (typeof code !== "string" || !code.trim()) {
      return { ok: false, error: "代码为空" };
    }
    if (code.length > MAX_CODE_LEN) {
      return { ok: false, error: "代码过长（上限 " + MAX_CODE_LEN + " 字符）" };
    }
    for (var i = 0; i < BANNED_PATTERNS.length; i++) {
      if (BANNED_PATTERNS[i].re.test(code)) {
        return {
          ok: false,
          error: "代码包含被禁用的能力：" + BANNED_PATTERNS[i].name
        };
      }
    }
    return { ok: true };
  }

  function compile(code) {
    var check = validateCode(code);
    if (!check.ok) throw new Error(check.error);

    /* 允许 AI 用 function drawScene(...) {} 的形式，自动包一层 */
    var body = code;

    if (/function\s+drawScene\s*\(/.test(code)) {
      body = code + "\n;drawScene(ctx, f);";
    }

    var fn;

    try {
      fn = new Function("ctx", "f", "Math", "console", BLOCKED + body);
    } catch (err) {
      throw new Error("语法错误：" + err.message);
    }

    return fn;
  }

  /* ======================================================================
     渲染一帧（返回像素哈希，用于确定性自检）
     ====================================================================== */

  function renderFrame(ctx, W, H, cfg, fn, t, hashPixels) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var f = makeFrame(ctx, W, H, cfg, t);
    var M = safeMath();
    var stubConsole = {
      log: function () {},
      warn: function () {},
      error: function () {}
    };

    try {
      fn.call(null, ctx, f, M, stubConsole);
    } finally {
      ctx.restore();
    }

    if (!hashPixels) return 0;

    var img = ctx.getImageData(0, 0, W, H).data;
    var h = 2166136261;
    for (var i = 0; i < img.length; i += 977) {
      h ^= img[i];
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /* ======================================================================
     自检：编译 + 多个时间点跑 + 确定性比较
     ====================================================================== */

  function probe(ctx, W, H, cfg, code, opts) {
    opts = opts || {};
    var fn = compile(code);
    var errors = [];
    var times = opts.times || [];

    if (!times.length) {
      var d = cfg.duration || 10;
      times = [0, d * 0.15, d * 0.3, d * 0.45, d * 0.6, d * 0.75, d * 0.9, d];
    }

    for (var i = 0; i < times.length; i++) {
      var t = times[i];
      try {
        var h1 = renderFrame(ctx, W, H, cfg, fn, t, true);
        var h2 = renderFrame(ctx, W, H, cfg, fn, t, true);

        if (h1 !== h2) {
          errors.push(
            "t=" +
              t.toFixed(2) +
              " 处画面不确定（两次渲染不一致）—— 可能用了 Math.random 或保存了帧间状态"
          );
          break;
        }
      } catch (err) {
        errors.push("t=" + t.toFixed(2) + " 运行出错：" + (err && err.message));
        break;
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      checked: times.length,
      fn: fn
    };
  }

  /* ======================================================================
     操作记录器：不读像素也能验证「画面只由 t 决定」
     --------------------------------------------------------------------------
     某些环境下（Worker + 无头渲染）getImageData 会卡住，
     改成记录绘制调用序列：同一 t 跑两次，序列必须完全一致。
     能抓到：Math.random / 帧间状态 / 依赖当前时间。
     ====================================================================== */

  function makeRecorder() {
    var ops = [];
    var gid = 0;

    function rec(name, args) {
      var s = name;
      for (var i = 0; i < args.length; i++) {
        var v = args[i];
        if (typeof v === "number") s += ":" + Math.round(v * 1000) / 1000;
        else if (v && v.__stub) s += ":" + v.__stub;
        else s += ":" + String(v);
      }
      ops.push(s);
    }

    function gradientStub() {
      gid += 1;
      var id = gid;
      return {
        __stub: "grad" + id,
        addColorStop: function (o, c) {
          rec("stop" + id, [o, c]);
        }
      };
    }

    var ctx = {
      __ops: ops,
      __reset: function () {
        ops.length = 0;
        gid = 0;
      },
      save: function () { rec("save", []); },
      restore: function () { rec("restore", []); },
      setTransform: function () { rec("setTransform", arguments); },
      clearRect: function () { rec("clearRect", arguments); },
      fillRect: function () { rec("fillRect", arguments); },
      beginPath: function () { rec("beginPath", []); },
      closePath: function () { rec("closePath", []); },
      moveTo: function () { rec("moveTo", arguments); },
      lineTo: function () { rec("lineTo", arguments); },
      quadraticCurveTo: function () { rec("quadraticCurveTo", arguments); },
      arc: function () { rec("arc", arguments); },
      ellipse: function () { rec("ellipse", arguments); },
      rect: function () { rec("rect", arguments); },
      roundRect: function () { rec("roundRect", arguments); },
      fill: function () { rec("fill", []); },
      stroke: function () { rec("stroke", []); },
      strokeRect: function () { rec("strokeRect", arguments); },
      fillText: function () { rec("fillText", arguments); },
      translate: function () { rec("translate", arguments); },
      rotate: function () { rec("rotate", arguments); },
      scale: function () { rec("scale", arguments); },
      createLinearGradient: function () { return gradientStub(); },
      createRadialGradient: function () { return gradientStub(); },
      measureText: function (s) { return { width: String(s).length * 10 }; },
      getImageData: function () { return { data: [] }; }
    };

    [
      "fillStyle",
      "strokeStyle",
      "lineWidth",
      "lineCap",
      "lineJoin",
      "font",
      "textAlign",
      "textBaseline",
      "shadowColor",
      "shadowBlur",
      "globalAlpha",
      "globalCompositeOperation"
    ].forEach(function (prop) {
      var v = prop === "lineWidth" ? 1 : "";
      Object.defineProperty(ctx, prop, {
        get: function () {
          return v;
        },
        set: function (nv) {
          v = nv;
          rec("set:" + prop, [nv]);
        }
      });
    });

    return ctx;
  }

  /** 用记录器跑一次，返回调用序列 */
  function transcript(ctx, W, H, cfg, fn, t) {
    ctx.__reset();

    var f = makeFrame(ctx, W, H, cfg, t);
    fn.call(null, ctx, f, safeMath(), {
      log: function () {},
      warn: function () {},
      error: function () {}
    });

    return ctx.__ops.join("|");
  }

  /** 自检：编译 + 多个时间点跑两遍，比对调用序列 */
  function probeTranscript(W, H, cfg, code, times) {
    var fn = compile(code);
    var ctx = makeRecorder();
    var errors = [];

    if (!times || !times.length) {
      var d = cfg.duration || 10;
      times = [0, d * 0.2, d * 0.4, d * 0.6, d * 0.8, Math.max(0, d - 0.1)];
    }

    for (var i = 0; i < times.length; i++) {
      var t = times[i];
      var a;
      var b;

      try {
        a = transcript(ctx, W, H, cfg, fn, t);
        b = transcript(ctx, W, H, cfg, fn, t);
      } catch (err) {
        errors.push("t=" + t.toFixed(2) + " 运行出错：" + ((err && err.message) || err));
        break;
      }

      if (a !== b) {
        errors.push(
          "t=" + t.toFixed(2) + " 处画面不确定（两次绘制不一致）—— 可能用了 Math.random 或保存了帧间状态"
        );
        break;
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      checked: times.length,
      fn: fn
    };
  }

  /* ---------- 导出（Worker 里是 self.SceneCore，页面里同时挂到 CodeMV 上） ---------- */

  var api = {
    validateCode: validateCode,
    compile: compile,
    probe: probe,
    probeTranscript: probeTranscript,
    makeRecorder: makeRecorder,
    renderFrame: renderFrame,
    makeFrame: makeFrame,
    rgbOf: rgbOf,
    rgba: rgba,
    mixColor: mixColor,
    hash: hash,
    safeMath: safeMath
  };

  root.SceneCore = api;
  if (root.CodeMV) root.CodeMV.SceneCore = api;
})(typeof self !== "undefined" ? self : window);
