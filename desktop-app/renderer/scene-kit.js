/* 画面工具箱：给 AI 生成的 drawScene 提供高质量的可组合图元。
   所有函数都接收 (ctx, f, options)，坐标按 f.w / f.h 归一化。 */

const SK = {
  lerp(a, b, t) {
    return a + (b - a) * t;
  },
  rgba(hex, alpha) {
    const value = hex.replace("#", "");
    const bigint = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
    return `rgba(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}, ${alpha})`;
  },
  mix(a, b, t) {
    const pa = parseInt(a.replace("#", ""), 16);
    const pb = parseInt(b.replace("#", ""), 16);
    const ch = (shift) => Math.round(SK.lerp((pa >> shift) & 255, (pb >> shift) & 255, t));
    return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
  },
};

function skSky(ctx, f, options = {}) {
  const stops = options.stops || ["#050811", "#0d1830", "#1d2c50"];
  const gradient = ctx.createLinearGradient(0, 0, 0, f.h);
  stops.forEach((color, index) => gradient.addColorStop(index / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, f.w, f.h);
}

function skGlow(ctx, f, options = {}) {
  const { x = 0.5, y = 0.5, r = 0.3, color = "#ffd08a", alpha = 0.55 } = options;
  const cx = x * f.w;
  const cy = y * f.h;
  const radius = r * Math.min(f.w, f.h);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, SK.rgba(color, alpha));
  gradient.addColorStop(0.5, SK.rgba(color, alpha * 0.35));
  gradient.addColorStop(1, SK.rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, f.w, f.h);
}

function skStars(ctx, f, options = {}) {
  const count = options.count || 90;
  const top = options.top || 0.55;
  const color = options.color || "#f6f1e7";
  for (let i = 0; i < count; i += 1) {
    const x = f.rand(i * 3 + 1) * f.w;
    const y = f.rand(i * 3 + 2) * f.h * top;
    const twinkle = 0.45 + 0.55 * Math.sin(f.t * (0.7 + f.rand(i) * 1.4) + i);
    const radius = 0.6 + f.rand(i * 3 + 3) * 1.5;
    ctx.fillStyle = SK.rgba(color, Math.min(1, twinkle));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function skMoon(ctx, f, options = {}) {
  const { x = 0.72, y = 0.2, r = 0.09, color = "#fff5e2", glow = 1 } = options;
  const cx = x * f.w;
  const cy = y * f.h;
  const radius = r * Math.min(f.w, f.h);
  if (glow > 0) {
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 4 * glow);
    halo.addColorStop(0, SK.rgba("#ffd9a0", 0.32 * glow));
    halo.addColorStop(0.5, SK.rgba("#ffd9a0", 0.1 * glow));
    halo.addColorStop(1, SK.rgba("#ffd9a0", 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, f.w, f.h);
  }
  const disc = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
  disc.addColorStop(0, "#fffdf4");
  disc.addColorStop(0.7, color);
  disc.addColorStop(1, "#f0d9ae");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function skSun(ctx, f, options = {}) {
  const { x = 0.7, y = 0.32, r = 0.07, color = "#ffcf87" } = options;
  skGlow(ctx, f, { x, y, r: r * 6, color, alpha: 0.35 });
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x * f.w, y * f.h, r * Math.min(f.w, f.h), 0, Math.PI * 2);
  ctx.fill();
}

function skSea(ctx, f, options = {}) {
  const horizon = (options.horizon || 0.62) * f.h;
  const colors = options.colors || ["#1d3a5c", "#0f2238", "#07111f"];
  const moonX = (options.moonX || 0.72) * f.w;
  for (let band = 0; band < 4; band += 1) {
    const baseY = horizon + ((f.h - horizon) / 4) * band * 1.05;
    const amplitude = (f.h - horizon) * (0.008 + band * 0.004) * (1 + f.beat * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, f.h);
    for (let x = 0; x <= f.w; x += f.w / 40) {
      const wave = Math.sin((x / f.w) * Math.PI * 2 + f.t * (0.5 + band * 0.2) + band) * amplitude;
      ctx.lineTo(x, baseY + wave);
    }
    ctx.lineTo(f.w, f.h);
    ctx.closePath();
    ctx.fillStyle = colors[Math.min(colors.length - 1, band)];
    ctx.fill();
  }
  for (let i = 0; i < 18; i += 1) {
    const y = horizon + (f.h - horizon) * (0.05 + f.rand(i) * 0.6);
    const half = f.w * (0.004 + f.rand(i + 40) * 0.02);
    const wobble = Math.sin(f.t * 1.4 + i) * f.w * 0.004;
    ctx.fillStyle = SK.rgba("#ffd9a0", 0.06 + 0.08 * f.beat);
    ctx.fillRect(moonX + wobble - half, y, half * 2, 1.4);
  }
}

function skMountains(ctx, f, options = {}) {
  const horizon = (options.horizon || 0.62) * f.h;
  const color = options.color || "#0b1424";
  const layers = options.layers || 3;
  for (let layer = layers - 1; layer >= 0; layer -= 1) {
    const baseY = horizon - layer * f.h * 0.015;
    const height = f.h * (0.05 + layer * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, f.h);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= f.w; x += f.w / 8) {
      const peak = baseY - Math.abs(Math.sin(x / f.w * Math.PI * (1.2 + layer) + layer * 2)) * height;
      ctx.lineTo(x, peak);
    }
    ctx.lineTo(f.w, f.h);
    ctx.closePath();
    ctx.fillStyle = SK.mix(color, "#1d2c50", layer * 0.12);
    ctx.fill();
  }
}

function skCity(ctx, f, options = {}) {
  const horizon = (options.horizon || 0.64) * f.h;
  const color = options.color || "#0a1220";
  const light = options.light || "#ffcf87";
  let x = -20;
  let index = 0;
  while (x < f.w + 20) {
    const width = 40 + f.rand(index + 7) * 90;
    const height = 40 + f.rand(index + 3) * (f.h - horizon) * 0.55;
    ctx.fillStyle = color;
    ctx.fillRect(x, horizon - height, width, height + 2);
    const windowGap = 14;
    for (let wy = horizon - height + 14; wy < horizon - 10; wy += windowGap) {
      for (let wx = x + 8; wx < x + width - 8; wx += 12) {
        if (f.rand(wx + wy) > 0.65) {
          ctx.fillStyle = SK.rgba(light, 0.25 + 0.55 * f.rand(wx * wy));
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
    x += width + 8 + f.rand(index) * 16;
    index += 1;
  }
}

function skWindow(ctx, f, options = {}) {
  const { x = 0.12, y = 0.12, w = 0.34, h = 0.42 } = options;
  const left = x * f.w;
  const top = y * f.h;
  const width = w * f.w;
  const height = h * f.h;
  ctx.strokeStyle = "rgba(20, 26, 38, 0.9)";
  ctx.lineWidth = 8;
  ctx.strokeRect(left, top, width, height);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(left + width / 2, top);
  ctx.lineTo(left + width / 2, top + height);
  ctx.moveTo(left, top + height / 2);
  ctx.lineTo(left + width, top + height / 2);
  ctx.stroke();
  const glow = ctx.createLinearGradient(left, top, left, top + height);
  glow.addColorStop(0, SK.rgba("#ffcf87", 0.18));
  glow.addColorStop(1, SK.rgba("#ffcf87", 0));
  ctx.fillStyle = glow;
  ctx.fillRect(left, top, width, height);
}

function skLanterns(ctx, f, options = {}) {
  const count = options.count || 6;
  const color = options.color || "#ffb45c";
  for (let i = 0; i < count; i += 1) {
    const baseX = 0.12 + f.rand(i + 11) * 0.76;
    const baseY = 0.34 + f.rand(i + 21) * 0.26;
    const drift = Math.sin(f.t * 0.6 + i) * 0.012;
    const x = (baseX + drift) * f.w;
    const y = (baseY - ((f.t * 0.012 + f.rand(i + 31)) % 0.4)) * f.h;
    const size = f.h * (0.012 + f.rand(i + 41) * 0.008);
    skGlow(ctx, f, { x: x / f.w, y: y / f.h, r: 0.05, color, alpha: 0.22 });
    ctx.fillStyle = SK.rgba(color, 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.55, size * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SK.rgba("#fff1cf", 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.16, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function skShadows(ctx, f, options = {}) {
  const { count = 5, color = "rgba(4, 8, 14, 0.5)", baseY = 0.85 } = options;
  for (let i = 0; i < count; i += 1) {
    const x = (0.1 + f.rand(i + 51) * 0.8) * f.w;
    const y = baseY * f.h;
    const length = f.h * (0.08 + f.rand(i + 61) * 0.12);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, length * 0.5, length * 0.16, Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function skTrees(ctx, f, options = {}) {
  const { count = 6, color = "#050b14", baseY = 0.9 } = options;
  for (let i = 0; i < count; i += 1) {
    const x = (0.05 + f.rand(i + 71) * 0.9) * f.w;
    const height = f.h * (0.1 + f.rand(i + 81) * 0.16);
    ctx.fillStyle = color;
    ctx.fillRect(x - 3, baseY * f.h - height, 6, height);
    ctx.beginPath();
    ctx.moveTo(x - height * 0.32, baseY * f.h - height * 0.55);
    ctx.lineTo(x, baseY * f.h - height * 1.05);
    ctx.lineTo(x + height * 0.32, baseY * f.h - height * 0.55);
    ctx.closePath();
    ctx.fill();
  }
}

function skRain(ctx, f, options = {}) {
  const count = options.count || 120;
  const color = options.color || "#a9c4e8";
  ctx.strokeStyle = SK.rgba(color, 0.35);
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    const x = (f.rand(i + 91) + f.t * 0.02) % 1 * f.w;
    const y = ((f.rand(i + 101) + f.t * 0.35) % 1) * f.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 14 + f.rand(i) * 10);
    ctx.stroke();
  }
}

function skSnow(ctx, f, options = {}) {
  const count = options.count || 90;
  for (let i = 0; i < count; i += 1) {
    const x = ((f.rand(i + 111) + Math.sin(f.t * 0.3 + i) * 0.01) % 1) * f.w;
    const y = ((f.rand(i + 121) + f.t * 0.03) % 1) * f.h;
    const r = 0.8 + f.rand(i) * 1.6;
    ctx.fillStyle = "rgba(248, 250, 255, 0.75)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function skFireflies(ctx, f, options = {}) {
  const count = options.count || 24;
  const color = options.color || "#ffd08a";
  for (let i = 0; i < count; i += 1) {
    const x = ((f.rand(i + 131) + Math.sin(f.t * 0.4 + i) * 0.02) % 1) * f.w;
    const y = ((f.rand(i + 141) + Math.cos(f.t * 0.3 + i) * 0.02) % 1) * f.h;
    const alpha = 0.35 + 0.65 * Math.abs(Math.sin(f.t * 1.6 + i));
    skGlow(ctx, f, { x: x / f.w, y: y / f.h, r: 0.012, color, alpha: alpha * 0.5 });
  }
}

function skLightRays(ctx, f, options = {}) {
  const { x = 0.7, y = -0.1, color = "#ffd9a0", count = 5 } = options;
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.04 * f.beat;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x * f.w, y * f.h);
    ctx.lineTo((x + spread - 0.12) * f.w, f.h);
    ctx.lineTo((x + spread + 0.12) * f.w, f.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function skBoat(ctx, f, options = {}) {
  const { x = 0.78, y = 0.78 } = options;
  const px = x * f.w;
  const py = y * f.h;
  ctx.fillStyle = "#050b14";
  ctx.beginPath();
  ctx.moveTo(px - 30, py);
  ctx.lineTo(px + 30, py);
  ctx.lineTo(px + 20, py + 12);
  ctx.lineTo(px - 20, py + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(px - 1, py - 34, 2, 34);
  skGlow(ctx, f, { x: x + 0.02, y: y - 0.04, r: 0.03, color: "#ffd08a", alpha: 0.4 });
}

function skPerson(ctx, f, options = {}) {
  const { x = 0.5, y = 0.82, h = 0.12 } = options;
  const px = x * f.w;
  const py = y * f.h;
  const height = h * f.h;
  ctx.fillStyle = "rgba(5, 9, 16, 0.92)";
  ctx.beginPath();
  ctx.arc(px, py - height * 0.9, height * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(px - height * 0.08, py - height * 0.76, height * 0.16, height * 0.5);
  ctx.fillRect(px - height * 0.16, py - height * 0.26, height * 0.12, height * 0.26);
}

function skVignette(ctx, f) {
  const gradient = ctx.createRadialGradient(f.w / 2, f.h / 2, f.h * 0.2, f.w / 2, f.h / 2, f.h * 0.85);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, f.w, f.h);
}
