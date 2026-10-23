# codemv · code-frame-studio

> 由 AI 编写代码、逐帧渲染画面，再合成为视频 —— **不使用视频生成模型**。

codemv 是一个桌面应用（PySide6）：你描述画面，AI 生成渲染代码，程序逐帧计算并合成 mp4。
画面是**算出来的**，不是模型猜出来的。

![界面截图](docs/screenshot.png)

## 功能特性

- **桌面应用本体**：场景管理、单帧预览、进度滑块、视频渲染、输出目录一键打开
- **AI 生成场景**：接入 OpenAI 兼容接口（默认 DeepSeek），生成后自动试渲染；
  若代码运行报错，会把错误自动回传给模型修复（最多 3 次）
- **SVG 图标**：界面图标来自开源 [Lucide](https://lucide.dev) 图标集（ISC 协议），
  全部为矢量 SVG，不依赖 emoji
- **更新机制**：从 GitHub 读取最新 Release/Tag，支持手动检查；
  可在设置里开关「自动检查更新」与「自动安装更新」（基于 `git pull`）
- **命令行**：同时保留 `preview` / `render` / `prompt` 子命令，方便脚本化

## 快速开始

### Windows：双击运行（推荐）

1. 双击 **`install.cmd`** —— 自动查找 Python 并安装依赖（默认源失败时自动改用清华镜像）
2. 双击 **`run.cmd`** —— 启动 codemv

> 如果 `pip` / `python` 命令不可用（PATH 未配置），这两个脚本会自动改用 `py` 启动器绕过问题。
> 想确认环境是否就绪，可在终端执行：`run.cmd --check`。

### 命令行方式

```powershell
# 1. 安装依赖（Python 3.10+）
py -m pip install -r requirements.txt

# 2. 启动桌面应用
py -m codemv gui
```

首次使用 AI 生成前，点击右上角 **设置** 图标，填写：

| 配置项 | 说明 |
| --- | --- |
| API 地址 | 默认 `https://api.deepseek.com/v1`（任何 OpenAI 兼容服务均可） |
| 模型名称 | 默认 `deepseek-chat` |
| API Key | 保存到 `.codemv/settings.json`（已 gitignore，不会提交） |

## 界面说明

- **左侧 · 场景**：选择 `scenes/` 下的场景文件，选中自动预览；
  顶部图标分别为「新建场景」「用默认编辑器打开代码」「打开场景目录」「删除场景」
- **左侧 · AI 生成场景**：输入画面描述，点击「生成并预览」，生成的代码保存为
  `scenes/generated_*.py`
- **右侧**：预览画布、动画进度滑块（0.00 ~ 1.00）、「预览帧」「渲染视频」按钮，
  以及输出目录入口
- **右上角**：「检查更新」与「设置」

## 命令行

| 命令 | 说明 |
| --- | --- |
| `python -m codemv gui` | 启动桌面应用 |
| `python -m codemv preview <scene.py> [-t 0.5] [-o output/preview.png]` | 渲染单帧 |
| `python -m codemv render <scene.py> [-o output/video.mp4] [--fps 30] [--duration 6]` | 渲染视频 |
| `python -m codemv prompt "画面描述"` | 输出给 AI 的场景生成提示词 |

## 场景契约（AI 生成的代码长这样）

```python
from PIL import Image

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    """t: 0.0 → 1.0 的动画进度，返回一帧图像。"""
    image = Image.new("RGB", (WIDTH, HEIGHT), (10, 12, 24))
    # ……用 t 画你想要的画面
    return image
```

要求：仅使用标准库 + `Pillow` + `numpy`；随机数固定种子；单帧渲染控制在 50ms 以内。

## 项目结构

```
code-frame-studio/
├── codemv/
│   ├── cli.py              # 命令行入口（gui / render / preview / prompt）
│   ├── renderer.py         # 场景加载、逐帧渲染、ffmpeg 合成
│   ├── prompt.py           # 提示词构建
│   └── app/                # 桌面应用
│       ├── main_window.py  # 主窗口
│       ├── settings_dialog.py
│       ├── settings.py     # 设置持久化（.codemv/settings.json）
│       ├── ai_client.py    # OpenAI 兼容客户端（标准库）
│       ├── updater.py      # GitHub 更新检查 + git pull
│       ├── workers.py      # 预览/渲染/AI/更新的后台线程
│       ├── icons.py        # SVG 图标加载
│       ├── theme.py        # 深色主题 QSS
│       └── widgets.py      # 自绘开关等
├── assets/icons/           # Lucide SVG 图标（ISC）
├── scenes/                 # 样例与 AI 生成的场景
├── prompts/scene_prompt.md # 给 AI 的提示词模板
├── tests/                  # unittest 测试集
├── docs/screenshot.png
├── output/                 # 渲染产物（已 gitignore）
├── run.cmd                 # Windows 双击启动
├── install.cmd             # Windows 双击安装依赖
├── requirements.txt
└── agents.md               # 开发约定
```

## 测试

```powershell
python -m unittest discover -s tests -v
```

覆盖：场景契约、逐帧渲染、视频合成、设置读写、AI 客户端（mock）、
更新版本比较与 `git pull`（mock）、界面离屏冒烟测试（无显示器也可运行）。

## 更新机制

- 版本号来自 `codemv/__init__.py` 的 `__version__`
- 检查顺序：GitHub Releases 最新版 → 仓库最新 Tag
- 发现新版本时顶部出现提示条，可点击「立即更新」执行 `git pull --ff-only`
- 设置中可开关「自动检查更新」「自动安装更新」

## 常见问题

### 提示 `'pip' 不是内部或外部命令` / `'python' 不是内部或外部命令`

说明 Python 已安装但没有加入 PATH（或 `python` 命中了 Microsoft Store 的占位程序）。三种解决方式：

1. 直接双击 `install.cmd` / `run.cmd`，脚本会自动使用 `py` 启动器；
2. 手动执行 `py -m pip install -r requirements.txt`、`py -m codemv gui`；
3. 把 Python 加入 PATH：重新运行 Python 安装包 → Modify → 勾选 **Add Python to PATH**，
   然后重新打开终端。需要手动添加时，把下面两个目录写入用户环境变量 `Path`：

   ```
   C:\Users\<用户名>\AppData\Local\Programs\Python\Python3XX\
   C:\Users\<用户名>\AppData\Local\Programs\Python\Python3XX\Scripts\
   ```

### 提示找不到 ffmpeg

安装依赖时 `imageio-ffmpeg` 已经自带 ffmpeg 二进制，无需单独安装；
如果使用系统 ffmpeg，可设置环境变量 `CODEMV_FFMPEG` 指向 `ffmpeg.exe`。

## 路线图

- [x] MVP：渲染内核 + 场景契约 + CLI + 样例场景 + 测试
- [x] v0.2.0：桌面应用界面、AI 生成与自动修复、SVG 图标、更新检查与开关
- [ ] 导出 GIF / 多场景拼接 / 参数化场景模板
- [ ] 安装包打包（Windows exe）

图标授权：Lucide Icons — ISC License，见 `assets/icons/LICENSE`。
