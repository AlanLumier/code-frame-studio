# 场景代码生成任务

你是一名 Python 图形程序员。请根据下面的画面描述，编写一个可以逐帧渲染的 Python 文件。

## 用户描述

{{description}}

## 输出要求

- 只输出一个完整的 Python 文件内容：不要 Markdown 代码围栏，不要任何解释文字。
- 文件顶部定义分辨率常量：

  ```python
  WIDTH, HEIGHT = 960, 540
  ```

- 必须定义渲染函数：

  ```python
  def render_frame(t: float) -> PIL.Image.Image:
      ...
  ```

  `t` 从 `0.0` 到 `1.0`，表示动画从开始到结束；画面必须随 `t` 连续变化。

- 只允许使用 Python 标准库 + `Pillow`（`PIL`）+ `numpy`。
- 禁止访问网络，禁止读取外部图片、字体、视频等素材。
- 随机数必须固定种子，保证每次渲染结果一致（可复现）。
- 单帧渲染耗时控制在 50ms 以内（960×540）。
- 画面构图完整、有美感：注意配色协调、层次分明，避免大面积纯黑或纯白、避免元素重叠混乱。
- 用运动、渐变、粒子、波纹、几何变换等手法表现画面主题，而不是只画静态图。

## 参考骨架

```python
import math

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), (10, 12, 24))
    draw = ImageDraw.Draw(img)

    # 用 t 控制动画，例如：
    radius = 40 + 30 * math.sin(t * math.tau)
    cx, cy = WIDTH / 2, HEIGHT / 2
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(120, 200, 255))

    return img
```

## 验收自检

生成后请在心里逐条确认：

1. 是否只有一个 Python 文件、没有多余文字？
2. 是否定义了 `render_frame(t)` 并返回 PIL Image？
3. `t = 0.0` 和 `t = 1.0` 是否分别是动画的起点和终点？
4. 是否没有使用网络、外部素材、未安装的第三方库？
5. 是否有可复现的固定随机种子？
