# codemv · code-frame-studio

> 由 AI 编写代码、逐帧渲染画面，再合成为视频 —— **不使用视频生成模型**。

codemv 把「生成画面」变成一件可编程的事：AI 负责写渲染代码，引擎负责逐帧执行并合成 mp4。
画面是**算出来的**，不是模型猜出来的。

## 快速开始

```powershell
# 1. 安装依赖（Python 3.10+）
pip install -r requirements.txt

# 2. 渲染一帧预览图（最快看到效果）
python -m codemv preview scenes/gradients.py -o output/preview.png

# 3. 渲染 6 秒视频
python -m codemv render scenes/gradients.py -o output/gradients.mp4 --duration 6
```

> 依赖 `Pillow`、`numpy` 与 `imageio-ffmpeg`（自带 ffmpeg 二进制，无需手动安装）。
> 如果使用系统 ffmpeg，可设置环境变量 `CODEMV_FFMPEG` 指向 `ffmpeg.exe`。

## 命令

| 命令 | 说明 |
| --- | --- |
| `python -m codemv preview <scene.py> [-t 0.5] [-o output/preview.png]` | 只渲染一帧，调参最快 |
| `python -m codemv render <scene.py> [-o output/video.mp4] [--fps 30] [--duration 6] [--width 960] [--height 540]` | 逐帧渲染并合成视频 |
| `python -m codemv render <scene.py> --frame-dir output/frames` | 保留逐帧 PNG，方便检查 |
| `python -m codemv prompt "画面描述"` | 输出给 AI 的场景生成提示词 |
| `python -m codemv --version` | 查看版本 |

## 场景契约（AI 生成的代码长这样）

每个场景是一个独立的 Python 文件，只需要实现一个函数：

```python
from PIL import Image

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    """t: 0.0 → 1.0 的动画进度，返回一帧图像。"""
    image = Image.new("RGB", (WIDTH, HEIGHT), (10, 12, 24))
    # ……用 t 画你想要的画面
    return image
```

要求：

- 仅使用标准库 + `Pillow` + `numpy`，不访问网络与外部素材；
- 随机数固定种子，保证每次渲染结果一致；
- 单帧渲染尽量控制在 50ms 以内（960×540）。

## 用 AI 生成场景（阶段一：手动模式）

1. 生成提示词：

   ```powershell
   python -m codemv prompt "夕阳下的赛博城市，霓虹灯闪烁" > prompt.txt
   ```

2. 把 `prompt.txt` 内容粘贴给任意大模型（DeepSeek / Claude / GPT 均可）；
3. 把模型返回的代码保存为 `scenes/my_scene.py`；
4. 预览、渲染：

   ```powershell
   python -m codemv preview scenes/my_scene.py -t 0.5 -o output/my_scene.png
   python -m codemv render scenes/my_scene.py -o output/my_scene.mp4
   ```

## 内置样例场景

| 文件 | 画面 |
| --- | --- |
| `scenes/gradients.py` | 流动渐变 + 呼吸光斑 |
| `scenes/particles.py` | 环绕星尘粒子 |
| `scenes/waves.py` | 起伏正弦波纹带 |

## 项目结构

```
code-frame-studio/
├── codemv/
│   ├── cli.py          # 命令行入口（render / preview / prompt）
│   ├── renderer.py     # 场景加载、逐帧渲染、ffmpeg 合成
│   ├── prompt.py       # 提示词构建
│   └── __main__.py     # python -m codemv
├── scenes/             # 样例场景（也是 AI 的 few-shot 范例）
├── prompts/
│   └── scene_prompt.md # 给 AI 的场景代码生成模板
├── tests/              # unittest 测试集
├── output/             # 渲染产物（已 gitignore）
├── requirements.txt
└── agents.md           # 项目开发约定
```

## 测试

```powershell
python -m unittest discover -s tests -v
```

测试覆盖：场景契约、逐帧渲染数量与尺寸、单帧预览、视频合成（无 ffmpeg 时自动跳过）、CLI 退出码、提示词构建。

## 路线图

- [x] MVP：渲染内核 + 场景契约 + CLI + 3 个样例场景 + 测试
- [ ] 阶段二：接入大模型 API，`codemv create "描述"` 自动生成并渲染场景，失败自动回传报错重试
- [ ] 阶段三：参数化场景、Web 预览界面、多场景拼接
