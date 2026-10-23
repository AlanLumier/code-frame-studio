# codemv · code-frame-studio

> 上传一首歌和它的歌词，AI 读懂节奏与歌词，**用代码逐帧画出画面**，生成带歌词、能卡点的 MV。
> 不使用视频生成模型 —— 画面是算出来的。

codemv 是一个面向全年龄的音乐 MV 工作台：三步向导，没有复杂参数；
AI 根据这首歌的真实数据（BPM、节拍、歌词）现场编写渲染代码，**不是套预设模板**。
内置两套渲染引擎：快速的矢量引擎，和更有手绘感的 **p5.brush** 引擎。

![界面截图](docs/screenshot.png)

## 三步做出你的 MV

1. **导入**：拖入音乐（mp3 / wav / m4a / flac），可选拖入 `.lrc` 歌词
2. **AI 创作**：写一句想要的感觉（也可以不写），AI 根据 BPM、节拍和歌词生成画面
3. **渲染导出**：选引擎、分辨率和帧率，一键渲染，自动混入原曲

![第一步：导入歌曲](docs/ui_step1.png)
![第三步：渲染导出](docs/ui_step3.png)

## 两套渲染引擎

| 引擎 | 说明 | 依赖 | 速度 |
| --- | --- | --- | --- |
| **内置矢量**（默认） | AI 生成 Python `render_frame(t, ctx)` 代码，Pillow + numpy 绘制 | 无额外依赖 | 快（720×1280 约 0.1 秒/帧） |
| **p5.brush 手绘** | AI 生成 p5.js + p5.brush 场景，headless Chrome/Edge 逐帧截图 | Node 18+、Chrome/Edge、`js` 依赖 | 慢（手绘笔触，建议先出 30 秒样片） |

在桌面端第 2 步的「画面引擎」里切换；也可以命令行指定 `--engine p5`。

## 快速开始

### Windows：双击运行（推荐）

1. 双击 **`install.cmd`** —— 自动查找 Python 并安装 Python 依赖
2. （可选，手绘引擎）双击 **`js\install_p5.cmd`** —— 安装 p5 / p5.brush / puppeteer-core（需要 Node 18+）
3. 双击 **`run.cmd`** 启动 codemv

> **桌面快捷方式**：双击 `scripts\create_shortcut.cmd`，会在桌面生成带图标的 `codemv` 快捷方式。

如果 `pip` / `python` 命令不可用（PATH 未配置），脚本会自动改用 `py` 启动器绕过问题；
可用 `run.cmd --check` 检查环境。

### 命令行方式

```powershell
py -m pip install -r requirements.txt
py -m codemv gui
```

首次使用前，点击右上角 **设置** 图标，填写 AI 配置：

| 配置项 | 说明 |
| --- | --- |
| API 地址 | 默认 `https://api.deepseek.com/v1`（任何 OpenAI 兼容服务均可） |
| 模型名称 | 默认 `deepseek-chat` |
| API Key | 保存到 `.codemv/settings.json`（已 gitignore，不会提交） |

## AI 生成逻辑（无预设模板）

```text
音乐 → ffmpeg 解码 → BPM / 节拍 / 能量 / 频段
歌词 .lrc → 逐句时间轴 + 全文
        ↓
把「歌曲真实数据 + 带时间戳歌词 + 用户想法」写进提示词
        ↓
大模型生成场景代码（Python 或 p5.brush JS）
        ↓
试渲染一帧 → 失败就把报错回传给模型修复（最多 3 次）
        ↓
逐帧渲染 + 叠加卡拉 OK 歌词 + 混入原曲 → MV
```

场景能拿到的 `ctx`：`t`（整曲进度）、`seconds`、`duration`、`beat`（节拍脉冲 0~1）、
`energy`（响度）、`spectrum`（低/中/高频）、`bpm`、`lyric_text`、`lyric_progress`。

## 界面说明

- **步骤条**：导入歌曲 → AI 生成画面 → 渲染导出，可随时点回上一步
- **第 1 步**：拖拽 / 点击选择音乐和歌词；自动显示时长、BPM、节拍数、歌词行数
- **第 2 步**：选择画面引擎、填写灵感、查看歌词；右侧预览、拖动时间轴、查看生成日志
- **第 3 步**：分辨率（1080×1920 / 720×1280 / 方形）、帧率、输出路径；
  可勾选「先导出 30 秒样片」快速试用
- **右上角**：AI 配置状态、版本号、检查更新、设置

## 命令行

| 命令 | 说明 |
| --- | --- |
| `python -m codemv gui` | 启动桌面应用 |
| `python -m codemv mv <scene> --audio song.mp3 [--lyrics song.lrc] [--engine p5] [-o output/mv.mp4]` | 渲染音乐 MV |
| `python -m codemv mv-preview <scene> --audio song.mp3 [--engine p5] [-t 10] [-o output/p.png]` | 渲染 MV 预览帧 |
| `python -m codemv preview <scene.py> [-t 0.5] [-o output/preview.png]` | 渲染普通场景单帧 |
| `python -m codemv render <scene.py> [-o output/video.mp4] [--fps 30] [--duration 6]` | 渲染普通场景视频 |
| `python -m codemv prompt "描述" [--mv]` | 输出给 AI 的场景生成提示词 |

## 场景契约

Python 引擎（MV）：

```python
from PIL import Image

def render_frame(t: float, ctx) -> Image.Image:
    width, height = ctx.width, ctx.height
    image = Image.new("RGB", (width, height), (10, 12, 24))
    # ……用 t 和 ctx.beat 画你想要的画面
    return image
```

p5.brush 引擎（JS）：

```js
function drawScene(t, ctx) {
  const W = ctx.width, H = ctx.height;
  brush.noStroke();
  brush.wash("#232B58", 255);
  brush.polygon([[0, 0], [W, 0], [W, H * 0.62], [0, H * 0.62]]);
  brush.noWash();
}
```

## 项目结构

```
code-frame-studio/
├── codemv/
│   ├── cli.py              # 命令行入口（gui / mv / mv-preview / render / preview / prompt）
│   ├── renderer.py         # 普通场景：加载、逐帧渲染、ffmpeg 合成
│   ├── audio.py            # 音频解码、BPM / 节拍 / 能量分析
│   ├── lyrics.py           # LRC 歌词解析与时间轴
│   ├── mv.py               # Python 引擎的 MV 渲染（歌词叠加 + 混音）
│   ├── p5_backend.py       # p5.brush 手绘引擎（Node + headless 浏览器）
│   ├── prompt.py           # 提示词构建（场景 / MV / p5）
│   └── app/                # 桌面应用
│       ├── main_window.py  # 三步向导主窗口
│       ├── mv_workers.py   # 音频分析 / AI 生成 / 预览 / 渲染线程
│       ├── settings_dialog.py
│       ├── settings.py     # 设置持久化（.codemv/settings.json）
│       ├── ai_client.py    # OpenAI 兼容客户端（标准库）
│       ├── updater.py      # GitHub 更新检查 + git pull
│       ├── icons.py        # SVG 图标加载
│       ├── theme.py        # 深色主题 QSS
│       └── widgets.py      # 自绘开关等
├── js/                     # p5.brush 渲染后端
│   ├── studio.html         # p5 + p5.brush 页面
│   ├── engine.js           # 固定画布 + 时间控制
│   ├── render.mjs          # headless 浏览器逐帧截图
│   ├── scenes/             # p5.brush 示例场景
│   └── install_p5.cmd      # 安装 p5 依赖
├── assets/icons/           # Lucide SVG 图标（ISC）
├── assets/codemv.ico       # 桌面快捷方式图标
├── scenes/                 # Python 引擎示例场景
├── prompts/                # AI 提示词模板（scene / mv / p5）
├── scripts/                # 创建桌面快捷方式
├── tests/                  # unittest 测试集
├── docs/                   # 界面截图
├── output/                 # 渲染产物（已 gitignore）
├── run.cmd / install.cmd   # Windows 双击启动 / 安装
├── requirements.txt
└── agents.md               # 开发约定
```

## 测试

```powershell
python -m unittest discover -s tests -v
```

覆盖：场景契约、逐帧渲染、视频合成、音频 BPM/节拍分析、LRC 解析、
MV 渲染与混音、AI 客户端与 AI 场景生成（mock，含 p5）、界面离屏冒烟测试。

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
3. 把 Python 加入 PATH：重新运行 Python 安装包 → Modify → 勾选 **Add Python to PATH**。

### 提示「手绘引擎不可用」

p5.brush 引擎需要 Node 18+、Chrome/Edge，以及 `js` 目录下的 npm 依赖。
双击 `js\install_p5.cmd` 安装依赖后重试；也可以先使用内置矢量引擎。

### 提示找不到 ffmpeg

`imageio-ffmpeg` 依赖已经自带 ffmpeg 二进制，无需单独安装；
如果使用系统 ffmpeg，可设置环境变量 `CODEMV_FFMPEG` 指向 `ffmpeg.exe`。

## 路线图

- [x] MVP：渲染内核 + 场景契约 + CLI + 样例场景 + 测试
- [x] v0.2.0：桌面应用、AI 生成与自动修复、SVG 图标、更新检查
- [x] v0.3.0：音乐 MV（BPM/节拍分析、LRC 歌词卡拉 OK、混音导出）
- [x] v0.4.0：面向全年龄的三步向导 UI、AI 按歌曲/歌词现场生成画面
- [x] v0.5.0：p5.brush 手绘渲染引擎、引擎切换、桌面快捷方式
- [ ] 对接 folia 播放器（Electron/TypeScript）的播放页 MV 能力
- [ ] 多场景分镜与转场、安装包打包（Windows exe）

图标授权：Lucide Icons — ISC License，见 `assets/icons/LICENSE`；
p5.brush 与 p5.js 遵循各自的开源协议（MIT / LGPL）。
