"""样例场景：起伏流动的正弦波纹带。"""

from __future__ import annotations

import colorsys
import math

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 960, 540
BANDS = 8


def render_frame(t: float) -> Image.Image:
    t = min(max(t, 0.0), 1.0)
    phase = t * math.tau
    image = Image.new("RGB", (WIDTH, HEIGHT), (6, 8, 18))
    draw = ImageDraw.Draw(image)

    for band in range(BANDS):
        ratio = band / (BANDS - 1) if BANDS > 1 else 0.0
        red, green, blue = colorsys.hsv_to_rgb(0.52 + 0.16 * ratio, 0.55, 1.0)
        color = (int(red * 255), int(green * 255), int(blue * 255))

        amplitude = 26.0 + 34.0 * math.sin(phase * 0.9 + ratio * math.pi) ** 2
        base_y = HEIGHT * (0.22 + 0.56 * ratio)
        points: list[tuple[float, float]] = []
        for x in range(-8, WIDTH + 9, 4):
            k = x / WIDTH
            envelope = math.sin(k * math.pi) ** 2
            y = base_y + amplitude * math.sin(k * math.tau * 1.6 + phase + ratio * 2.4) * envelope
            points.append((x, y))

        width = max(1, int(1 + 3 * math.sin(ratio * math.pi)))
        draw.line(points, fill=color, width=width, joint="curve")

    return image
