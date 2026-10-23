"""样例场景：流动的渐变色场 + 呼吸光斑。"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    t = min(max(t, 0.0), 1.0)
    phase = t * math.tau

    xs = np.linspace(0.0, 1.0, WIDTH, dtype=np.float32)[None, :]
    ys = np.linspace(0.0, 1.0, HEIGHT, dtype=np.float32)[:, None]

    red = 0.5 + 0.5 * np.sin(phase * 1.0 + xs * 2.2 + ys * 1.4)
    green = 0.5 + 0.5 * np.sin(phase * 1.3 + xs * 1.7 - ys * 2.1 + 2.0)
    blue = 0.5 + 0.5 * np.sin(phase * 0.8 - xs * 1.2 + ys * 1.9 + 4.0)

    rgb = np.stack([red, green, blue], axis=-1) * 255.0
    image = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)), mode="RGB")

    # 呼吸光斑：用模糊的圆叠加提亮画面
    glow = Image.new("RGB", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(glow)
    cx = WIDTH * (0.5 + 0.33 * math.sin(phase))
    cy = HEIGHT * (0.5 + 0.28 * math.cos(phase * 1.4))
    radius = 70 + 45 * (0.5 + 0.5 * math.sin(phase * 2.3))
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(255, 196, 84),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(42))
    return ImageChops.add(image, glow)
