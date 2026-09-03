# 第三方组件说明

票据排版助手使用以下核心开源组件：

- PDF.js：Apache License 2.0，用于本地 PDF 文本提取和预览。
- pdf-lib：MIT License，用于生成和嵌入 PDF 页面。
- Noto Sans SC：SIL Open Font License 1.1，用于生成中文汇总页。

随应用分发的 Noto Sans SC 字体由 Fontsource 提供的 WOFF2 版本转换为
TTF，以提高 macOS Preview、Chromium 和 Poppler 的兼容性。字体内容未作
字形修改，完整许可证见 `src/assets/NotoSansSC-LICENSE.txt`。

其余 JavaScript 依赖及对应许可证可在 `package-lock.json` 和各 npm 包中查看。
