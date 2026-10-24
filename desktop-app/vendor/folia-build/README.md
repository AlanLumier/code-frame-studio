# Folia 静态构建产物（占位）

本目录用于存放 **Folia 构建后的静态站点**（vite build 的 dist），供 iframe 接入使用。

当前为空 —— 构建需要在能访问 npm registry 的机器上执行：

    pwsh -File tools/build-folia.ps1
    # 国内镜像：
    pwsh -File tools/build-folia.ps1 -Registry https://registry.npmmirror.com

构建完成后会自动写入 BUILD-INFO.json（上游 commit / 构建时间 / 体积 / 许可证）。

详见 docs/FOLIA-BUILD.md。