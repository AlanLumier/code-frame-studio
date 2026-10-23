// 示例：p5.brush 手绘风格的月夜海面。
// 场景约定：定义全局函数 drawScene(t, ctx)，使用 brush.* 绘制。

function ellipsePoints(cx, cy, rx, ry, count = 40) {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return points;
}

function drawScene(t, ctx) {
  const W = ctx.width;
  const H = ctx.height;
  const beat = ctx.beat || 0;
  const energy = ctx.energy || 0;
  const horizon = H * 0.62;
  const seconds = ctx.seconds || 0;

  // 夜空：水彩底
  brush.noStroke();
  brush.noHatch();
  brush.noFill();
  brush.wash("#232B58", 255);
  brush.polygon([[0, 0], [W, 0], [W, horizon], [0, horizon]]);
  brush.noWash();

  // 地平线暖光
  brush.fill("#D97757", 110);
  brush.noStroke();
  brush.polygon([[0, horizon - H * 0.055], [W, horizon - H * 0.055], [W, horizon + H * 0.008], [0, horizon + H * 0.008]]);
  brush.noFill();

  // 海面
  brush.wash("#1F2550", 235);
  brush.polygon([[0, horizon], [W, horizon], [W, H], [0, H]]);
  brush.noWash();

  // 波浪笔触
  for (let band = 0; band < 6; band += 1) {
    const baseY = horizon + (H - horizon) * (0.10 + band * 0.14);
    const points = [];
    for (let x = -12; x <= W + 12; x += Math.max(12, W / 26)) {
      const wave = Math.sin((x / W) * Math.PI * 2 + seconds * 1.4 + band) * (3 + beat * 5);
      points.push([x, baseY + wave + Math.sin((x / W) * Math.PI * 4 - seconds) * 2]);
    }
    brush.set("ink", band % 2 === 0 ? "#7FA0C8" : "#3A4E7A", 1.4 + energy * 0.8);
    brush.noFill();
    brush.spline(points, 0.45);
  }

  // 月亮
  const moonX = W * 0.72;
  const moonY = H * 0.22;
  const moonR = W * 0.105;
  brush.set("ink", "#D9A24A", 1.2);
  brush.fill("#FFF5E2", 245);
  brush.noStroke();
  brush.polygon(ellipsePoints(moonX, moonY, moonR * (1 + beat * 0.03), moonR * (1 + beat * 0.03)));
  brush.noFill();

  // 星星
  for (let index = 0; index < 22; index += 1) {
    const sx = ((index * 137.5) % W);
    const sy = ((index * 89.3) % (horizon * 0.75));
    brush.set("inkfine", "#FFF5E2", 0.8);
    brush.circle(sx, sy, 0.7 + beat * 1.1);
  }

  // 漂浮的灯
  for (let index = 0; index < 5; index += 1) {
    const lx = W * (0.16 + index * 0.17);
    const ly = H * (0.34 + Math.sin(seconds * 0.6 + index) * 0.015 + index * 0.02);
    const size = W * 0.022;
    brush.set("ink", "#8A5A2B", 1.0);
    brush.fill("#FFC766", 235);
    brush.noStroke();
    brush.polygon(ellipsePoints(lx, ly, size * 0.7, size, 20));
    brush.noFill();
    brush.set("inkfine", "#8A5A2B", 0.8);
    brush.line(lx, ly + size, lx, ly + size * 1.5);
  }

  // 船
  const boatX = W * 0.78;
  const boatY = horizon + (H - horizon) * 0.35;
  brush.set("ink", "#151B33", 1.6);
  brush.noFill();
  brush.spline([[boatX - W * 0.03, boatY], [boatX, boatY + H * 0.012], [boatX + W * 0.03, boatY]], 0.4);
  brush.fill("#151B33", 220);
  brush.polygon([[boatX - W * 0.03, boatY], [boatX + W * 0.03, boatY], [boatX + W * 0.02, boatY + H * 0.018], [boatX - W * 0.02, boatY + H * 0.018]]);
  brush.noFill();
}
