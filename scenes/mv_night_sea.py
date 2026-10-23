"""MV 场景：月夜海面 · 漂浮灯。

契约：render_frame(t, ctx)，ctx 来自 codemv.mv.MVContext。
画面底部 1/5 保持简洁，方便叠加歌词。
"""

from __future__ import annotations

import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

_cache: dict = {}


# --------------------------------------------------------------------------- 基础色板
def _gradient(height: int, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    ys = np.linspace(0.0, 1.0, height, dtype=np.float32)
    colors = np.zeros((height, 3), dtype=np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        mask = (ys >= p0) & (ys <= p1)
        if not np.any(mask):
            continue
        fraction = (ys[mask] - p0) / max(1e-6, p1 - p0)
        for channel in range(3):
            colors[mask, channel] = c0[channel] * (1 - fraction) + c1[channel] * fraction
    return np.clip(colors, 0, 255).astype(np.uint8)


def _background(width: int, height: int) -> np.ndarray:
    key = ("bg", width, height)
    if key not in _cache:
        sky = _gradient(
            height,
            [
                (0.00, (4, 7, 22)),
                (0.24, (13, 13, 42)),
                (0.44, (36, 27, 66)),
                (0.54, (74, 44, 84)),
                (0.575, (128, 76, 98)),
                (0.59, (150, 92, 104)),
                (0.60, (36, 56, 88)),
                (0.72, (17, 34, 60)),
                (0.86, (9, 20, 38)),
                (1.00, (4, 9, 20)),
            ],
        )
        _cache[key] = np.repeat(sky[:, None, :], width, axis=1)
    return _cache[key]


def _vignette(width: int, height: int) -> np.ndarray:
    key = ("vignette", width, height)
    if key not in _cache:
        axis_x = np.linspace(-1.0, 1.0, width, dtype=np.float32)
        axis_y = np.linspace(-1.0, 1.0, height, dtype=np.float32)
        gx, gy = np.meshgrid(axis_x, axis_y)
        distance = np.sqrt((gx * 0.82) ** 2 + (gy * 1.05) ** 2)
        _cache[key] = np.clip(1.12 - distance * 0.42, 0.45, 1.0)[..., None].astype(np.float32)
    return _cache[key]


def _glow(size: int, color: tuple[int, int, int], power: float = 2.4) -> Image.Image:
    key = ("glow", size, color, power)
    if key not in _cache:
        axis = np.linspace(-1.0, 1.0, size, dtype=np.float32)
        gx, gy = np.meshgrid(axis, axis)
        distance = np.sqrt(gx * gx + gy * gy)
        alpha = (np.clip(1.0 - distance, 0.0, 1.0) ** power * 255).astype(np.uint8)
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        rgba[..., 0], rgba[..., 1], rgba[..., 2] = color
        rgba[..., 3] = alpha
        _cache[key] = Image.fromarray(rgba, "RGBA")
    return _cache[key]


def _moon_sprite(radius: int) -> Image.Image:
    key = ("moon", radius)
    if key not in _cache:
        size = radius * 2 + 2
        axis = np.linspace(-1.0, 1.0, size, dtype=np.float32)
        gx, gy = np.meshgrid(axis, axis)
        distance = np.sqrt(gx * gx + gy * gy)
        shade = np.clip(distance, 0.0, 1.0)[..., None]
        center = np.array([255, 246, 222], dtype=np.float32)
        edge = np.array([246, 216, 166], dtype=np.float32)
        rgb = center * (1 - shade) + edge * shade
        alpha = np.clip((1.0 - distance) * radius * 1.6, 0.0, 1.0) * 255
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
        rgba[..., 3] = alpha.astype(np.uint8)
        _cache[key] = Image.fromarray(rgba, "RGBA")
    return _cache[key]


# --------------------------------------------------------------------------- 天空
def _draw_stars(draw: ImageDraw.ImageDraw, width: int, height: int, seconds: float, energy: float) -> None:
    key = ("stars", width, height)
    if key not in _cache:
        rng = random.Random(17)
        stars = []
        for _ in range(max(50, int(width * height / 7000))):
            stars.append(
                (
                    rng.uniform(0, width),
                    rng.uniform(0, height * 0.54),
                    rng.uniform(0.35, 1.5),
                    rng.uniform(0, math.tau),
                    rng.uniform(0.4, 1.6),
                )
            )
        _cache[key] = stars
    stars = _cache[key]

    for x, y, radius, phase, speed in stars:
        twinkle = 0.55 + 0.45 * math.sin(seconds * speed + phase)
        alpha = int((50 + 130 * twinkle) * (0.55 + 0.45 * energy))
        draw.ellipse(
            [x - radius, y - radius, x + radius, y + radius],
            fill=(226, 232, 255, max(0, min(255, alpha))),
        )
        if radius > 1.2:
            draw.line([x - radius * 3.5, y, x + radius * 3.5, y], fill=(210, 220, 255, alpha // 5), width=1)
            draw.line([x, y - radius * 3.5, x, y + radius * 3.5], fill=(210, 220, 255, alpha // 5), width=1)


def _clouds_sprite(width: int, height: int) -> Image.Image:
    key = ("clouds_sprite", width, height)
    if key not in _cache:
        double_width = width * 2
        layer = Image.new("RGBA", (double_width, int(height * 0.30)), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        rng = random.Random(5)
        for _ in range(16):
            x = rng.uniform(0, double_width)
            y = rng.uniform(0.15, 0.8) * layer.height
            rw = rng.uniform(0.10, 0.30) * width
            rh = rng.uniform(0.010, 0.024) * height
            draw.ellipse([x - rw, y - rh, x + rw, y + rh], fill=(226, 196, 216, rng.randint(8, 18)))
        _cache[key] = layer.filter(ImageFilter.GaussianBlur(radius=max(2, int(width * 0.008))))
    return _cache[key]


def _draw_clouds(image: Image.Image, width: int, height: int, seconds: float) -> Image.Image:
    sprite = _clouds_sprite(width, height)
    offset = int((seconds * 5.0) % (sprite.width - width))
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    layer.alpha_composite(sprite.crop((offset, 0, offset + width, sprite.height)), (0, int(height * 0.30)))
    return Image.alpha_composite(image, layer)


def _draw_shooting_star(draw: ImageDraw.ImageDraw, width: int, height: int, seconds: float) -> None:
    index = int(seconds // 9.0)
    local = seconds - index * 9.0
    if local > 0.8:
        return
    rng = random.Random(index * 13 + 5)
    start_x = width * rng.uniform(0.12, 0.55)
    start_y = height * rng.uniform(0.06, 0.20)
    progress = local / 0.8
    x = start_x + progress * width * 0.16
    y = start_y + progress * height * 0.045
    trail = width * 0.07 * (1 - progress * 0.4)
    alpha = int(170 * (1 - progress))
    draw.line([(x, y), (x - trail, y - trail * 0.3)], fill=(235, 240, 255, alpha), width=2)


# --------------------------------------------------------------------------- 海面
def _horizon_glow(width: int, height: int) -> Image.Image:
    key = ("horizon_glow", width, height)
    if key not in _cache:
        strip_height = max(4, int(height * 0.045))
        alpha = (np.linspace(1.0, 0.0, strip_height, dtype=np.float32) ** 1.8 * 100).astype(np.uint8)
        rgba = np.zeros((strip_height, width, 4), dtype=np.uint8)
        rgba[..., 0], rgba[..., 1], rgba[..., 2] = 244, 158, 126
        rgba[..., 3] = np.repeat(alpha[:, None], width, axis=1)
        _cache[key] = Image.fromarray(rgba, "RGBA")
    return _cache[key]


def _draw_sea(draw: ImageDraw.ImageDraw, width: int, height: int, seconds: float, beat: float, energy: float) -> None:
    horizon = height * 0.59
    bands = 8
    for index in range(bands):
        fraction = index / (bands - 1)
        y0 = horizon + (height - horizon) * (0.02 + 0.98 * (fraction ** 1.2))
        amplitude = height * (0.0018 + 0.0045 * fraction) * (0.85 + 0.35 * beat)
        wavelength = width * (0.7 + 0.55 * fraction)
        phase = seconds * (0.22 + 0.16 * fraction) + index * 0.8
        points = []
        step = max(10, width // 48)
        for x in range(-step, width + step * 2, step):
            wave = math.sin((x / wavelength) * math.tau + phase)
            wave += 0.35 * math.sin((x / (wavelength * 0.45)) * math.tau - phase * 1.5)
            points.append((x, y0 + amplitude * wave))

        near = np.array([8, 18, 34], dtype=np.float32)
        far = np.array([44, 72, 108], dtype=np.float32)
        mixed = far * (1 - fraction) + near * fraction
        color = tuple(int(channel) for channel in mixed)
        draw.polygon(points + [(width + step * 2, height + 2), (-step, height + 2)], fill=color)

        if index < bands - 1:
            crest = [(x, y - 1) for x, y in points]
            draw.line(crest, fill=(120, 160, 190, 12), width=1)


def _draw_reflection(image: Image.Image, width: int, height: int, seconds: float, beat: float, energy: float) -> Image.Image:
    moon_x = width * 0.70
    horizon = height * 0.59
    column_width = int(width * 0.46)
    column_left = int(moon_x - column_width / 2)
    local_moon_x = moon_x - column_left

    layer = Image.new("RGBA", (column_width, image.height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # 月晕在水面的柔和光斑
    glow_size = int(width * 0.26)
    glow = _glow(glow_size, (255, 214, 160), power=2.6)
    layer.alpha_composite(glow, (int(local_moon_x - glow_size / 2), int(horizon - glow_size * 0.25)))

    for index in range(24):
        fraction = index / 24
        y = horizon + (fraction ** 1.35) * (height - horizon) * 0.55
        wobble = math.sin(seconds * 1.3 + index * 1.1) * (2 + index * 0.5)
        half = (width * 0.006 + fraction * width * 0.040) * (1 - fraction * 0.2) * (1 + 0.22 * beat)
        alpha = int(max(0, 62 - index * 2.1) * (0.55 + 0.45 * beat) * (0.55 + 0.45 * energy))
        draw.line(
            [(local_moon_x + wobble - half, y), (local_moon_x + wobble + half, y)],
            fill=(255, 222, 172, alpha),
            width=max(1, int(height * 0.0018)),
        )
    layer = layer.filter(ImageFilter.GaussianBlur(radius=max(2, int(width * 0.004))))
    image.alpha_composite(layer, (column_left, 0))
    return image


# --------------------------------------------------------------------------- 月亮
def _draw_moon(image: Image.Image, width: int, height: int, seconds: float, beat: float) -> Image.Image:
    moon_x, moon_y = width * 0.70, height * 0.215
    radius = width * 0.082

    halo_size = int(radius * 7.5)
    image.alpha_composite(
        _glow(halo_size, (255, 206, 150), power=2.9),
        (int(moon_x - halo_size / 2), int(moon_y - halo_size / 2)),
    )
    image.alpha_composite(
        _glow(int(radius * 4.2), (255, 224, 178), power=2.2),
        (int(moon_x - radius * 2.1), int(moon_y - radius * 2.1)),
    )

    sprite = _moon_sprite(int(radius))
    image.alpha_composite(sprite, (int(moon_x - sprite.width / 2), int(moon_y - sprite.height / 2)))
    return image


# --------------------------------------------------------------------------- 漂浮灯
def _lantern_positions(width: int, height: int) -> list[dict]:
    key = ("lanterns", width, height)
    if key not in _cache:
        rng = random.Random(23)
        lanterns = []
        for _ in range(7):
            lanterns.append(
                {
                    "x": rng.uniform(0.08, 0.92),
                    "phase": rng.uniform(0.0, 1.0),
                    "speed": rng.uniform(0.010, 0.022),
                    "size": rng.uniform(0.0075, 0.0135),
                    "drift": rng.uniform(0.004, 0.014),
                    "sway": rng.uniform(0.5, 1.3),
                }
            )
        _cache[key] = lanterns
    return _cache[key]


def _draw_lanterns(image: Image.Image, width: int, height: int, seconds: float, beat: float) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for lantern in _lantern_positions(width, height):
        progress = (seconds * lantern["speed"] + lantern["phase"]) % 1.0
        x = width * lantern["x"] + math.sin(seconds * lantern["sway"] + lantern["phase"] * 6.0) * width * lantern["drift"]
        y = height * (0.56 - progress * 0.42)
        if y < height * 0.08 or y > height * 0.58:
            continue
        size = width * lantern["size"]
        glow_size = int(size * 6)
        layer.alpha_composite(
            _glow(glow_size, (255, 196, 120), power=2.4),
            (int(x - glow_size / 2), int(y - glow_size / 2)),
        )
        draw.rounded_rectangle(
            [x - size * 0.44, y - size * 0.60, x + size * 0.44, y + size * 0.60],
            radius=size * 0.42,
            fill=(255, 181, 96, 238),
            outline=(255, 233, 190, 235),
            width=max(1, int(size * 0.14)),
        )
        draw.rectangle(
            [x - size * 0.18, y - size * 0.68, x + size * 0.18, y - size * 0.56],
            fill=(255, 233, 190, 200),
        )
        draw.line(
            [(x, y + size * 0.6), (x, y + size * 0.82)],
            fill=(255, 200, 130, 150),
            width=max(1, int(size * 0.08)),
        )
        draw.ellipse(
            [x - size * 0.14, y - size * 0.05, x + size * 0.14, y + size * 0.28],
            fill=(255, 249, 228, 235),
        )
    return Image.alpha_composite(image, layer)


# --------------------------------------------------------------------------- 前景
def _draw_foreground(image: Image.Image, width: int, height: int, seconds: float) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    far_points = [(0, height * 0.935)]
    for x in range(0, width + 16, 16):
        y = height * 0.935 + math.sin(x / width * 3.4 + 1.1) * height * 0.010
        far_points.append((x, y))
    far_points += [(width, height), (0, height)]
    draw.polygon(far_points, fill=(5, 9, 18, 255))

    near_points = [(0, height * 0.965)]
    for x in range(0, width + 16, 16):
        y = height * 0.965 + math.sin(x / width * 2.2 + 3.4) * height * 0.008
        near_points.append((x, y))
    near_points += [(width, height), (0, height)]
    draw.polygon(near_points, fill=(2, 5, 11, 255))

    rng = random.Random(31)
    for _ in range(14):
        base_x = width * rng.uniform(-0.02, 0.20)
        base_y = height * rng.uniform(0.94, 1.0)
        length = height * rng.uniform(0.05, 0.11)
        sway = math.sin(seconds * 0.9 + base_x * 30) * width * 0.010
        draw.line(
            [(base_x, base_y), (base_x + sway * 0.4, base_y - length * 0.55), (base_x + sway, base_y - length)],
            fill=(3, 6, 13, 245),
            width=max(1, int(width * 0.0026)),
            joint="curve",
        )
    return Image.alpha_composite(image, layer)


def _draw_boat(image: Image.Image, width: int, height: int, seconds: float) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    base_x = width * 0.79
    base_y = height * 0.735 + math.sin(seconds * 0.8) * height * 0.0035
    scale = width * 0.040

    hull = [
        (base_x - scale * 1.05, base_y),
        (base_x + scale * 1.05, base_y),
        (base_x + scale * 0.66, base_y + scale * 0.34),
        (base_x - scale * 0.7, base_y + scale * 0.34),
    ]
    draw.polygon(hull, fill=(7, 12, 22, 255))
    person_x = base_x + scale * 0.15
    draw.ellipse(
        [person_x - scale * 0.13, base_y - scale * 0.52, person_x + scale * 0.13, base_y - scale * 0.26],
        fill=(7, 12, 22, 255),
    )
    draw.rounded_rectangle(
        [person_x - scale * 0.19, base_y - scale * 0.28, person_x + scale * 0.19, base_y - scale * 0.02],
        radius=scale * 0.10,
        fill=(7, 12, 22, 255),
    )
    pole_x = base_x + scale * 0.72
    draw.line([(pole_x, base_y + scale * 0.1), (pole_x, base_y - scale * 0.85)], fill=(7, 12, 22, 255), width=max(1, int(scale * 0.07)))
    glow_size = int(scale * 2.4)
    layer.alpha_composite(
        _glow(glow_size, (255, 198, 128), power=2.1),
        (int(pole_x - glow_size / 2), int(base_y - scale * 0.95 - glow_size / 2)),
    )
    draw.ellipse(
        [pole_x - scale * 0.08, base_y - scale * 1.02, pole_x + scale * 0.08, base_y - scale * 0.86],
        fill=(255, 214, 150, 240),
    )
    return Image.alpha_composite(image, layer)


def _draw_fireflies(draw: ImageDraw.ImageDraw, width: int, height: int, seconds: float, energy: float) -> None:
    rng = random.Random(41)
    for _ in range(16):
        base_x = rng.uniform(0.02, 0.98) * width
        base_y = rng.uniform(0.68, 0.95) * height
        phase = rng.uniform(0, math.tau)
        speed = rng.uniform(0.3, 0.9)
        x = base_x + math.sin(seconds * speed + phase) * width * 0.01
        y = base_y + math.cos(seconds * speed * 0.8 + phase) * height * 0.006
        alpha = int((40 + 70 * (0.5 + 0.5 * math.sin(seconds * 2.0 + phase))) * (0.5 + 0.5 * energy))
        draw.ellipse([x - 1.4, y - 1.4, x + 1.4, y + 1.4], fill=(255, 220, 150, alpha))


# --------------------------------------------------------------------------- 主函数
def render_frame(t: float, ctx) -> Image.Image:
    """绘制一帧。ctx 提供 width / height / beat / energy 等。"""
    width, height = ctx.width, ctx.height
    seconds = ctx.seconds

    image = Image.fromarray(_background(width, height), "RGB").convert("RGBA")

    sea_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    _draw_sea(ImageDraw.Draw(sea_layer), width, height, seconds, ctx.beat, ctx.energy)
    sea_top = int(height * 0.575)
    sea_crop = sea_layer.crop((0, sea_top, width, height))
    blurred = sea_crop.filter(ImageFilter.GaussianBlur(radius=max(1, int(width * 0.0016))))
    image.alpha_composite(blurred, (0, sea_top))
    image.alpha_composite(_horizon_glow(width, height), (0, int(height * 0.585)))

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    _draw_stars(draw, width, height, seconds, ctx.energy)
    _draw_shooting_star(draw, width, height, seconds)
    image.alpha_composite(overlay)

    image = _draw_clouds(image, width, height, seconds)
    image = _draw_reflection(image, width, height, seconds, ctx.beat, ctx.energy)
    image = _draw_moon(image, width, height, seconds, ctx.beat)
    image = _draw_lanterns(image, width, height, seconds, ctx.beat)
    image = _draw_boat(image, width, height, seconds)

    foreground = Image.new("RGBA", image.size, (0, 0, 0, 0))
    _draw_fireflies(ImageDraw.Draw(foreground), width, height, seconds, ctx.energy)
    image.alpha_composite(foreground)

    image = _draw_foreground(image, width, height, seconds)

    array = np.asarray(image.convert("RGB"), dtype=np.float32) * _vignette(width, height)
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), "RGB")
