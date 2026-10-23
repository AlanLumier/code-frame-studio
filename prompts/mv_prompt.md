# MV 场景代码生成任务

你是一名擅长「用代码做逐帧手绘动画」的图形程序员。请根据下面的歌曲信息，写一个可用于音乐 MV 的 Python 场景文件。

## 歌曲信息

- 主题 / 情绪：{{description}}
- 是否竖屏：{{orientation}}
- 歌词会由渲染器自动叠加在画面底部约 16% 的位置，**不要自己在画面里写歌词**

## 技术要求

- 只输出一个完整的 Python 文件内容，不要 Markdown 代码围栏，不要解释。
- 只允许使用标准库 + Pillow + numpy，禁止网络与外部素材。
- 入口函数必须同时接受时间和上下文：

  ```python
  def render_frame(t: float, ctx) -> Image.Image:
      ...
  ```

- `ctx` 提供（全部是每帧实时值）：
  - `ctx.width` / `ctx.height`：画布尺寸；
  - `ctx.t`：0.0 ~ 1.0 的整曲进度；
  - `ctx.seconds`：当前秒数；
  - `ctx.duration`：整曲时长；
  - `ctx.beat`：距上一个节拍的时间衰减脉冲，0~1，拍点最接近 1；
  - `ctx.energy`：当前响度 0~1；
  - `ctx.spectrum`：低 / 中 / 高频能量三元组，各 0~1；
  - `ctx.bpm`：估算的 BPM。
- 画面尺寸必须使用 `ctx.width` / `ctx.height`，不要写死分辨率。
- 随机数固定种子，保证每次渲染结果一致。
- 单帧渲染时间控制在 150ms 以内（1080×1920 参考值）；建议使用缓存（`dict`）保存渐变、光晕、星星位置等静态资源。

## 画面要求（参考「手绘逐帧」动画标准）

- **扁平插画风格**：柔和渐变的天空/背景、明确的色板（3~5 个主色）、大色块 + 少量细节。
- **画面要有内容**：月亮、海面、山、城市、路灯、人物剪影等具体场景元素；不要只画抽象粒子。
- **持续运动**：云飘、水波、光斑呼吸、粒子漂浮、镜头轻微漂移，至少 3 种运动同时存在。
- **卡点**：用 `ctx.beat` 控制光晕大小、亮度、水波幅度或镜头缩放；用 `ctx.energy` 控制整体明暗。
- **构图**：主体位于画面上 1/2 ~ 2/3 区域；底部 18% 保持简洁，给歌词留位置，避免高对比元素。
- **情绪随音乐推进**：可让配色 / 元素数量随 `ctx.t` 缓慢变化，形成段落感。
- **禁止文字**（包括歌名、歌手、水印），歌词由渲染器统一叠加。

## 参考骨架

```python
from PIL import Image, ImageDraw

_cache = {}

def _background(width, height):
    if "bg" not in _cache:
        ...  # 用 numpy 画渐变
    return _cache["bg"]

def render_frame(t: float, ctx) -> Image.Image:
    width, height = ctx.width, ctx.height
    image = Image.fromarray(_background(width, height)).convert("RGBA")
    # 用 ctx.beat / ctx.energy / ctx.spectrum 驱动动画
    return image.convert("RGB")
```

## 验收自检

1. 是否只输出一个 Python 文件、没有多余文字？
2. 是否定义 `render_frame(t, ctx)` 并返回 PIL Image？
3. 是否使用了 `ctx.width` / `ctx.height`，而非固定尺寸？
4. 是否至少 3 种元素在持续运动？
5. 底部 18% 是否足够简洁，能给歌词让位？
6. 是否没有文字、没有网络请求、没有外部素材？
