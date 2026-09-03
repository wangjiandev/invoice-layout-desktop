# 票据排版助手

票据排版助手是一款本地离线的 macOS 桌面工具，用来整理 PDF 票据、调整打印顺序、统计分类金额，并为后续 A4 二联/八联排版提供统一工作台。

当前版本是可运行的界面骨架，已经支持：

- 拖入或批量选择本地 PDF。
- 调整票据顺序、分类、金额和排版类型。
- 使用精确十进制计算分类金额与总金额。
- 保存边距、裁切线和汇总页设置。
- 保留“生成 A4 PDF”和“打印”入口，不生成伪结果。

PDF 自动识别、A4 排版生成和系统打印将在后续阶段接入。

## 隐私设计

- 应用完全离线运行，不上传文件。
- 票据路径、票面文本和金额不会持久化，关闭应用即清除。
- 仓库忽略 PDF、OFD、输出目录和私有测试材料。
- 请勿在 issue、PR、日志或测试夹具中提交真实发票、身份证号、税号或行程信息。

## 开发

需要 Node.js 24 和 npm。

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run lint
npm run typecheck
npm test
npm run package
```

Electron 端到端测试会先打包应用：

```bash
npm run test:e2e
```

## macOS 打包

```bash
npm run make -- --platform=darwin --arch=arm64
npm run make -- --platform=darwin --arch=x64
```

当前安装包没有 Apple Developer ID 签名和公证。首次打开时，macOS 可能要求用户在系统安全设置中确认。

## 自动发布

- `main` push 和 pull request 会运行 lint、类型检查、单元测试和打包检查。
- 仅形如 `v1.2.3` 的 tag 会触发 Release 工作流。
- tag 必须与 `package.json` 中的版本完全一致。
- 工作流分别生成 Apple Silicon 与 Intel 的 DMG、ZIP 和 SHA-256 校验文件，然后创建 GitHub Release。

示例发布流程：

```bash
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main v0.1.0
```

## 后续路线

1. 使用 PDF.js 生成缩略图并提取文本。
2. 识别电子发票、航空行程单和铁路电子客票金额。
3. 使用 pdf-lib 生成 A4 普通票据 2 联、铁路票据 8 联和汇总页。
4. 接入保存对话框、打印预览和系统打印。

## License

[MIT](LICENSE)
