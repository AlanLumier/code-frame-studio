// codemv p5.brush 渲染引擎：固定画布 + 由外部设置时间，逐帧截图。
// 场景文件只需定义全局函数 drawScene(t, ctx)，使用 p5 的 brush.* 绘制。

const params = new URLSearchParams(location.search);
const CANVAS_W = Math.max(64, parseInt(params.get("w") || "360", 10));
const CANVAS_H = Math.max(64, parseInt(params.get("h") || "640", 10));

let T = 0;
let CTX = { width: CANVAS_W, height: CANVAS_H, seconds: 0, beat: 0, energy: 0, spectrum: [0, 0, 0] };

window.codemvError = null;
window.codemvReady = false;

function setup() {
  createCanvas(CANVAS_W, CANVAS_H, WEBGL);
  pixelDensity(1);
  noLoop();
  brush.scaleBrushes(2);
  brush.add("ink", {
    type: "default", weight: 5, scatter: 0.25, sharpness: 0.8, grain: 40,
    opacity: 235, spacing: 0.2, pressure: [1.15, 0.75], rotate: "natural", noise: 0.15,
  });
  brush.add("inkfine", {
    type: "default", weight: 2.4, scatter: 0.15, sharpness: 0.85, grain: 40,
    opacity: 230, spacing: 0.2, pressure: [1.1, 0.8], rotate: "natural", noise: 0.1,
  });
  brush.add("dry", {
    type: "default", weight: 12, scatter: 3, sharpness: 0.3, grain: 6,
    opacity: 90, spacing: 0.6, pressure: [1, 0.6], rotate: "natural", noise: 0.4,
  });
  window.codemvReady = true;
}

function draw() {
  background("#F3EBDC");
  window.codemvError = null;
  push();
  translate(-CANVAS_W / 2, -CANVAS_H / 2);
  try {
    if (typeof window.drawScene === "function") {
      window.drawScene(T, CTX);
    }
  } catch (error) {
    window.codemvError = String((error && error.stack) || error);
  }
  pop();
}

window.codemvSetState = async (t, ctx) => {
  T = Number(t) || 0;
  CTX = ctx || CTX;
  await redraw();
  return window.codemvError;
};

window.codemvInfo = () => ({ width: CANVAS_W, height: CANVAS_H, ready: window.codemvReady });
