# Folia Fidelity（AGPL-3.0 可选模块）

本目录是 **Code MV 的「Folia 还原」可选模块**，用于高保真复刻
[Folia](https://github.com/chthollyphile/folia-major) 的沉浸式歌词视觉风格。

## 来源与许可

- 上游项目：https://github.com/chthollyphile/folia-major
- 上游提交：875aaf0d51381b84021e406b85215b287248b057
- 上游许可证：**AGPL-3.0**（见本目录 LICENSE）
- 上游 README 另注明「仅供个人学习、技术交流与非营利测试使用」

## 本目录内容

| 文件 | 说明 |
|---|---|
| LICENSE | 上游 AGPL-3.0 许可证原文 |
| 	uning.json | 从上游 src/types.ts 的 DEFAULT_*_TUNING 提取的默认调参（派生数据） |
| palettes.json | 从上游官方预览图提取的主题配色近似值（派生数据） |
| ender.js | **独立的 Canvas 重实现**：按上述调参与配色复刻 8 个 visualizer 的排版/动效（AGPL-3.0 发布，因其派生自上游数据） |

## 许可边界（重要）

- 主项目 Code MV 为 **MIT**；本目录是可选模块，单独以 **AGPL-3.0** 授权。
- 如果你**分发包含本目录的版本**或**把它部署到公网**，按 AGPL-3.0 你需要向使用者提供完整对应源码。
- 如果只想保持 MIT 纯净：删除本目录，并在 index.html 移除对应 <script> 标签即可（主项目会退回「Folia 灵感」风格）。
- 我们**没有复制** Folia 的 React/Three.js 渲染代码或图片素材；ender.js 是依据调参和配色自行实现。
- 这也意味着它**不是像素级一致**（引擎不同：上游是 React + WebGL/Canvas，我们是 Canvas 2D）。
  若要真正的像素级一致，需要把整个 Folia Web 端打包后以 iframe 方式嵌入，并整体遵守 AGPL-3.0。