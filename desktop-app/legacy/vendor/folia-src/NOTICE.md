# Folia 源码（裁剪版，仅主样式）

- 上游：https://github.com/chthollyphile/folia-major
- 提交：e1fcc9a8b9b891618d87c513c4da6519a5c22d23
- 许可证：AGPL-3.0（见同目录 LICENSE），与本项目整体一致

## 保留范围

只保留 13 个主样式 visualizer 源码与公共类型：

 + (fume lumiere classic cadenza partita cappella tilt diorama pendolo monet sonnet tempera claddagh -join ", ") + 

已裁剪：构建配置、Electron 外壳、API/同步服务、测试、图片素材、i18n、设置面板等。

## 用途与限制

- 作源码参考/备份；运行时使用 `vendor/folia-fidelity/` 的 Canvas 独立实现，不直接运行这些 React 组件。
- 这些组件依赖 React + Pixi/Three + Vite 构建链和上游运行环境，本仓库不包含其依赖；
  要真正运行上游 visualizer，需在其原仓库构建后以 iframe / 独立页方式接入。
- 分发本目录请遵守 AGPL-3.0 并保留上游署名。