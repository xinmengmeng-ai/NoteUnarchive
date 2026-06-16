# NoteUnarchive

中文 | [English](README.md)

NoteUnarchive 是一款本地优先的桌面笔记导出工具，用于直接读取本地笔记客户端已经落盘的数据，并导出为开放格式。

它不需要云端 API、账号密码或远程同步权限。只有已经同步或缓存到本地的笔记可以被导出。


<img width="690" height="444" alt="image" src="https://github.com/user-attachments/assets/49956260-78a9-4a69-8055-2078099ae37b" />


## 支持的数据源

| 数据源 | 本地数据 | 状态 |
| --- | --- | --- |
| 有道云笔记 | SQLite 数据库和本地缓存笔记文件 | v1.0 |

## 后续开发计划

以下数据源计划在后续版本支持，v1.0 暂不支持：

- 印象笔记 / Evernote
- 金山文档

## 导出格式

- Markdown：笔记正文和本地资源引用，适合迁移到 Markdown 工作流。
- Word：带内嵌图片的单文件 `.docx` 文档，适合上传和分享。
- HTML：可直接在浏览器打开的独立文档。

历史 JSON 导出记录仍会保留用于兼容查看，但新建导出不再提供 JSON 选项。

## 环境要求

- Windows 10/11 x64
- Node.js 18+

## 开发

安装依赖：

```bash
npm install
```

为 Electron 重建 native 依赖：

```bash
npm run rebuild
```

启动应用：

```bash
npm start
```

运行测试：

```bash
npm test
```

构建 Windows 安装包和绿色版：

```bash
npm run build
```

构建产物输出到 `dist/`。

## 项目结构

```text
src/
  main/        Electron 主进程、IPC、数据源适配器、转换器和导出器
  renderer/    HTML 渲染层和 UI 资源
build/         打包资源
scripts/       开发和打包脚本
tests/         Jest 测试和 fixtures
```

## 注意事项

- 应用只读取本地数据，不上传笔记内容。
- 导出完整度取决于官方客户端的本地缓存是否完整。
- 部分富文本样式会在导出时被规范化，不追求和原编辑器像素级一致。

## 开源协议

MIT
