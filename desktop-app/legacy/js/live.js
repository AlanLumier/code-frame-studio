/* ==========================================================================
   Code MV · 生动化引擎（"活起来"的小工具）
   --------------------------------------------------------------------------
   解决「画面死气沉沉」：所有渲染器共用这一层提供
     • 镜头呼吸（缓慢推拉 + 轻微位移）
     • 节拍脉冲（鼓点上放大 / 闪光）
     • 光晕 bloom
     • 漂浮微尘 / 星火
     • 拍点爆闪粒子
   全部是确定性的（t 的函数），导出与实时播放一致。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var U = NS.utils;

  function beatPhase(api, t) {
    try {
      return api.beatPhase ? api.beatPhase(t) : (t * 2) % 1;
    } catch (e) {
      return (t * 2) % 1;
    }
  }

  /** 0~1 的节拍脉冲：拍点瞬间为 1，快速衰减 */
  function beat(t, api) {
    var phase = beatPhase(api, t);
    return Math.pow(1 - phase, 3);
  }

  /** 镜头呼吸：返回 { scale, dx, dy, rot } */
  function camera(t) {
    var breath = 1 + 0.008 * Math.sin(t * 0.55);
    var dx = Math.sin(t * 0.21) * 4 + Math.sin(t * 0.07) * 6;
    var dy = Math.cos(t * 0.17) * 3 + Math.cos(t * 0.05) * 5;
    var rot = Math.sin(t * 0.09) * 0.0025;
    return { scale: breath, dx: dx, dy: dy, rot: rot };
  }

  /** 在渲染器外套一层镜头呼吸（返回 restore 函数） */
  function applyCamera(ctx, W, H, t, extraShake) {
    var c = camera(t);
    var shake = extraShake || 0;
    var sx = shake ? Math.sin(t * 47) * shake : 0;
    var sy = shake ? Math.cos(t * 41) * shake : 0;

    ctx.save();
    ctx.translate(W / 2 + c.dx + sx, H / 2 + c.dy + sy);
    if (c.rot) ctx.rotate(c.rot);
    ctx.scale(c.scale, c.scale);
    ctx.translate(-W / 2, -H / 2);

    return function restore() {
      ctx.restore();
    };
  }

  /** 径向光晕 */
  function bloom(ctx, x, y, r, color, alpha) {
    if (r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, U.rgba(color, alpha));
    g.addColorStop(0.45, U.rgba(color, alpha * 0.28));
    g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.fill();
  }

  /** 漂浮微尘 / 星火（画在最上层，让画面有空气感） */
  function atmosphere(ctx, W, H, t, api, opts) {
    opts = opts || {};

    var count = opts.count || 70;
    var color = opts.color || [255, 255, 255];
    var speed = opts.speed || 1;
    var e = 0;
    try {
      e = api && api.energy ? api.energy(t) : 0;
    } catch (err) {
      e = 0;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (var i = 0; i < count; i++) {
      var seed = U.hash(i * 3.7 + 1.3);
      var x =
        (U.hash(i * 7.1 + 0.7) * W +
          Math.sin(t * 0.25 * speed + i) * W * 0.03 +
          t * (4 + seed * 10) * speed) %
        W;
      var y =
        (U.hash(i * 11.3 + 2.1) * H +
          Math.cos(t * 0.3 * speed + i * 1.7) * H * 0.03 -
          t * (3 + seed * 6) * speed) %
        H;

      if (x < 0) x += W;
      if (y < 0) y += H;

      var a = (0.05 + seed * 0.12 + e * 0.1) * (0.6 + 0.4 * Math.sin(t * 1.7 + i));
      ctx.fillStyle = U.rgba(color, Math.max(0, a));
      var r = 0.7 + seed * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, U.TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 拍点爆闪：围绕中心的一圈火花 */
  function burst(ctx, cx, cy, t, api, color, opts) {
    opts = opts || {};
    var b = beat(t, api);
    if (b < 0.02) return;

    var count = opts.count || 14;
    var radius = (opts.radius || 140) * (1 - b * 0.6);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (var i = 0; i < count; i++) {
      var a = (i / count) * U.TAU + U.hash(i) * 0.6;
      var d = radius * (0.4 + U.hash(i * 3.1) * 0.6);
      var x = cx + Math.cos(a) * d;
      var y = cy + Math.sin(a) * d * 0.75;
      ctx.fillStyle = U.rgba(color, b * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + U.hash(i * 7.7) * 2.2, 0, U.TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 拍点闪光遮罩（很轻，别盖住画面） */
  function flash(ctx, W, H, t, api, color, strength) {
    var b = beat(t, api);
    if (b < 0.05) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = U.rgba(color || [255, 255, 255], b * (strength || 0.03));
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** 给数值加一点节拍弹跳 */
  function pulse(t, api, amount) {
    return 1 + beat(t, api) * (amount == null ? 0.05 : amount);
  }

  NS.live = {
    beat: beat,
    beatPhase: beatPhase,
    camera: camera,
    applyCamera: applyCamera,
    bloom: bloom,
    atmosphere: atmosphere,
    burst: burst,
    flash: flash,
    pulse: pulse
  };
})(window.CodeMV);
