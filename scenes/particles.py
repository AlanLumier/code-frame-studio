"""样例场景：环绕流动的星尘粒子。"""

from __future__ import annotations

import colorsys
import math
import random

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 960, 540
PARTICLE_COUNT = 160


def _build_particles() -> list[dict[str, float]]:
    rng = random.Random(20240521)
    particles: list[dict[str, float]] = []
    for _ in range(PARTICLE_COUNT):
        particles.append(
            {
                "orbit": rng.uniform(60.0, 330.0),
                "angle": rng.uniform(0.0, math.tau),
                "speed": rng.uniform(0.25, 1.1) * (-1.0 if rng.random() < 0.35 else 1.0),
                "size": rng.uniform(0.8, 3.6),
                "hue": rng.uniform(0.45, 0.85),
                "alpha": float(rng.randint(70, 230)),
            }
        )
    return particles


PARTICLES = _build_particles()


def render_frame(t: float) -> Image.Image:
    t = min(max(t, 0.0), 1.0)
    image = Image.new("RGB", (WIDTH, HEIGHT), (7, 10, 24))
    draw = ImageDraw.Draw(image, "RGBA")

    cx, cy = WIDTH / 2.0, HEIGHT / 2.0
    for index, particle in enumerate(PARTICLES):
        angle = particle["angle"] + t * math.tau * particle["speed"]
        orbit = particle["orbit"] * (0.85 + 0.15 * math.sin(t * math.tau + index))
        x = cx + math.cos(angle) * orbit
        y = cy + math.sin(angle) * orbit * 0.62

        red, green, blue = colorsys.hsv_to_rgb(particle["hue"], 0.55, 1.0)
        color = (int(red * 255), int(green * 255), int(blue * 255), int(particle["alpha"]))
        size = particle["size"]
        draw.ellipse([x - size, y - size, x + size, y + size], fill=color)

    # 中心核心的柔光
    for step in range(5):
        radius = 10.0 + step * 14.0
        alpha = 150 - step * 28
        draw.ellipse(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            fill=(150, 210, 255, alpha),
        )

    return image
