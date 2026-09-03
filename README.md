# 票据排版助手

票据排版助手是一款完全离线的 macOS 桌面应用，用于读取 PDF 票据、识别
报销金额和分类，并生成适合 A4 打印与裁切的报销材料。

## 功能

- 拖入或批量选择 PDF，按 SHA-256 内容去重。
- 自动识别增值税电子发票、航空电子客票行程单和铁路电子客票。
- 多页 PDF 按页拆分，每页可独立分类、排序和排版。
- 使用精确十进制计算分类小计和报销总额。
- 低置信度、扫描件和手工修改结果必须确认后才能生成。
- 普通票据按 A4 上下 2 联排版。
- 铁路票据按 A4 2 列 × 4 行排版，上下半页各 4 张。
- 支持旋转、50%–100% 安全缩放和单元格内位移，不裁掉票面内容。
- 生成总打印包、普通票据分册和铁路票据分册。
- 应用内分页预览、批量保存和 macOS 系统打印。

## 识别规则

- 增值税电子发票读取“价税合计（小写）”，可读取时与大写金额核对。
- 航空行程单读取费用行最后的“合计”金额。
- 铁路电子客票读取“票价”或“退票费”。
- 分类优先依据票面文字，无法确定时使用导入目录和文件名提示。

纯图片扫描 PDF 不进行 OCR。应用仍会显示票面，用户手工选择分类、填写金额
并确认后即可参与汇总与排版。加密、损坏或无法嵌入的 PDF 必须先解除保护或
重新导出。

## 隐私设计

- 应用不联网、不上传票据。
- 主进程使用随机文件 ID 管理源文件，网页界面无法读取任意本地路径。
- 票据路径、提取文本和金额不持久化，也不会写入日志。
- 生成文件先放入随机会话临时目录，关闭应用后清理。
- 仓库忽略 PDF、OFD、输出目录和真实测试材料。
- 请勿在 issue、PR 或日志中提交身份证号、税号、票面文本或真实票据。

## 使用

1. 拖入 PDF 或点击“选择 PDF”。
2. 等待自动分析，检查右侧分类金额和总金额。
3. 对黄色“需要复核”项目修正分类或金额，然后点击确认。
4. 拖动调整顺序；需要时展开“微调”设置旋转、缩放和位置。
5. 点击“生成 A4 PDF”进入预览。
6. 在预览中切换总打印包或分册，选择“保存全部”或“打印当前文档”。

打印时请选择 A4 纸。应用会请求系统使用 A4、纵向和无附加页边距打印；若
打印驱动仍显示缩放选项，建议选择 100% 或“实际大小”。

## 开发

需要 Node.js 24 和 npm。

```bash
npm install
npm run dev
```

完整检查：

```bash
npm run lint
npm run typecheck
npm test
npm run package
npm run test:e2e
```

测试只使用无个人信息的合成 PDF。真实票据只允许在开发者本机执行临时验收，
不得提交到 Git。

## macOS 打包与发布

```bash
npm run make -- --platform=darwin --arch=arm64
npm run make -- --platform=darwin --arch=x64
```

当前安装包没有 Apple Developer ID 签名和公证，首次打开时 macOS 可能要求在
系统安全设置中确认。

- `main` push 和 pull request 会运行 lint、类型检查、测试和打包检查。
- 仅 `v*.*.*` tag 会触发 Release，且 tag 必须等于 `v${package.json.version}`。
- Release 工作流生成 Apple Silicon/Intel 的 DMG、ZIP 和 SHA-256 校验文件。

```bash
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main v0.1.0
```

## 开源许可证

项目采用 [MIT License](LICENSE)。PDF.js、pdf-lib 和内置 Noto Sans SC 字体
的说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
