# EPUB 导入

## 概述

在 SRS 插件内导入 EPUB 为**普通 Orca 笔记**，可选继续创建渐进阅读书籍。普通导入与 IR 初始化分离：仅导入模式不写 `#card`、`srs.*` 或 IR 排期。

## 命令与入口

| 入口 | 标识 |
| --- | --- |
| 命令 | `{plugin}.importEpub` |
| 工具栏 | `{plugin}.importEpubButton`（`ti-book-upload`） |
| 斜杠命令 | 组 SRS / 导入 EPUB |
| UI 挂载 | Headbar `EpubImportDialogMount` |

## 模块边界

```text
src/importers/epub/          解析、资源、manifest、编排
src/components/epub-import/  向导 UI
src/srs/book-ir/             第二阶段 IR 计划 / 顺序推进 / 移出
```

`src/main.ts` 不承载业务；注册在 `registry/commands.ts`、`uiComponents.tsx`、`contextMenuRegistry.tsx`。

## 数据契约

### 书籍块属性

| 属性 | 说明 |
| --- | --- |
| `epub.fingerprint` | 源文件 SHA-256，精确去重键 |
| `epub.sourceAssetPath` | 上传的源 EPUB，用于断点续传 |
| `epub.importStatus` | `importing` \| `partial` \| `complete` |
| `epub.manifest` | 版本化 JSON `EpubBookManifestV1` |

### 章节块属性

| 属性 | 说明 |
| --- | --- |
| `epub.bookId` | 所属书籍 blockId |
| `epub.chapterKey` | 稳定章节身份（href + spineIndex） |
| `epub.spineIndex` | 阅读顺序 |
| `epub.href` | 源 href |

读写 manifest 必须经 `parseEpubManifest` / `serializeEpubManifest`；禁止字符串拼接或静默兜底。

## 流程

1. 选文件 → SHA-256；精确指纹命中则打开已有书并停止。
2. 解析 metadata / 章节 → 确认书名 → 选择章节。
3. **先上传源 EPUB**；失败则不创建任何笔记。
4. 创建书籍页与章节页（独立根级页 + 有序引用），逐章 checkpoint。
5. 部分失败 → `partial` + 失败清单；「继续导入」跳过已成功章节。
6. 结果页：`完成` 或 `继续创建渐进阅读书籍`（第二阶段独立章节选择）。

章节选择会过滤 EPUB 的纯封面包装页。前置页不在目录中时，会尝试 HTML 标题和首段短文本，不再显示无意义的 `Chapter N`。

### 章节标题来源与优先级

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | EPUB 3 nav TOC | 链接路径相对 **nav 文件目录** 解析（支持 `../`、fragment、URL 编码），匹配 spine 后写入标题 |
| 2 | EPUB 2 NCX | nav 零匹配或部分匹配时补齐**尚未有标题**的章节；不覆盖已有有效目录标题 |
| 3 | 正文 heading | 仅当目录标题缺失，或正文能提供更完整语义标题时使用；**纯数字 / 纯编号**（如 `1`、`Chapter 1`、`PART I`）不得覆盖有效目录标题 |
| 4 | 文档 fallback | 无 heading 时用 `<title>` 或首段短文本；仍无则 `未命名章节 N` |

正文开头若为连续的「编号 heading + 章名 heading」（如 `<h1>1</h1><h1>WHY LOGIC?</h1>`），会合并为可读标题，且不把后续小节标题并入章节名。

nav 与 spine 比较前统一规范化路径：去 fragment、处理 `.` / `..`、前导斜杠与反斜杠、尽力 URL 解码（畸形编码不抛错）。

## 正文 outline 结构

章节 HTML 经 `htmlOutline` → `orcaOutlineImporter` 写入 Orca，形成**真正的父子 block 层级**，而不是全部挂在章节页下的扁平列表。

### 标题归属

| 规则 | 说明 |
| --- | --- |
| 栈式父级 | 章节页为虚拟 level 0；`hN` 成为最近 level `< N` 的标题（或章节页）的子 block |
| 正文归属 | 标题之后的段落/列表/引用/图片归属于当前标题，直到同级或更高级标题出现 |
| 级别跳跃 | 例如 h1 后直接 h3：挂到最近更浅父级，不合成中间标题 |
| 页面标题去重 | 仅移除与章节页标题**等价**的开头标题：单个匹配 `h1`，或开头连续的「编号 + 章名」两个 heading 合并后与页标题等价时两者都移除；不匹配则全部保留（含 `h2`–`h6`） |

示例：

```text
# 标题
## 标题2
标题2 内容
## 标题3
标题3 内容
```

导入为：

```text
- 标题
  - 标题2
    - 标题2 内容
  - 标题3
    - 标题3 内容
```

### 空白清理

- 忽略纯空白文本与只含空格 / 换行 / NBSP / 无意义 `<br>` 的段落与布局容器。
- 连续空段落不会生成多个空 block；正常相邻段落成为相邻 block。
- 非空正文内部的 `<br>` 是有效换行，清理时必须保留。
- **保留** `<hr>`、含图片/脚注标记/列表/引用等有效内容的节点。
- `div` / `section` 等排版容器会被拍平，避免空壳容器污染 outline。

## 去重策略

- 同指纹：不新建，打开已有。
- 同名不同指纹：仅提示疑似重复，不自动关联。
- **不用** `batchId` 作为书籍身份。

## 测试

- `src/importers/epub/epubParser.test.ts`
- `src/importers/epub/epubImportService.test.ts`
- `src/importers/epub/htmlOutline.test.ts`（标题 token、空白清理、语义保留）
- `src/importers/epub/orcaOutlineImporter.test.ts`（insertBlock 父子关系与顺序）
- `src/components/epub-import/epubImportViewModel.test.ts`

## 相关文件

- `src/importers/epub/*`
- `src/components/epub-import/*`
- `模块文档/渐进阅读_BookIR.md`
