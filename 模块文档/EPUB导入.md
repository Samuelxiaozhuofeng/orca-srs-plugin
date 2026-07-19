# EPUB 导入

> 文档同步日期：2026-07-19
> 变更说明：WP-07 **纯层**已落地严格 HTML 清洗、资源预算、MIME 魔数、解析层 AbortSignal；ZIP load 与 entry 解压完成后会再次检查取消。
> **未验收 / 证据阻塞**：`importEpub` / `resumeEpubImport` 写入链取消、超限图片「省略 vs 零写入拒绝」preflight、真机 Network 与 resume 一致性。

## 概述

在 SRS 插件内将 EPUB 导入为**普通 Orca 笔记**（书籍页 + 独立章节页 + 有序引用），可选在结果页进入第二阶段 **渐进阅读（BookIR）** 初始化。

**硬边界**：`importEpub` / `resumeEpubImport` **不**创建 `#card`、**不**写 `srs.*`、**不**写 `ir.*` 排期。IR 仅由向导「继续创建渐进阅读书籍」或独立 IR 入口调用 `initializeBookIR`（`src/srs/book-ir/bookIRService.ts`）完成。

## 命令与入口

| 入口 | 标识 | 行为 |
| --- | --- | --- |
| 命令 | `${pluginName}.importEpub` | `showEpubImportDialog` 打开向导 |
| 命令 | `${pluginName}.resumeEpubImport` | 对指定 `bookBlockId` 调用 `resumeEpubImport`（块菜单也可触发） |
| 工具栏 | `${pluginName}.importEpubButton`（`ti-book-upload`） | 绑定 `importEpub` |
| 斜杠 | 组 SRS / 标题「导入 EPUB」 | 绑定 `importEpub` |
| Headbar 挂载 | `${pluginName}.epubImportDialogMount` | `EpubImportDialogMount`（Valtio `isOpen`） |
| 块菜单 | `resumeEpubImportMenu`（`contextMenuRegistry`） | 对带 epub 属性的书触发继续导入 |

注册位置：`registry/commands.ts`、`uiComponents.tsx`、`contextMenuRegistry.tsx`。业务不在 `main.ts`。

## 模块边界

```text
src/importers/epub/                 解析、指纹、资源、manifest、编排、outline
src/components/epub-import/         向导 UI + 纯 view-model
src/srs/book-ir/                    第二阶段 IR（计划 / 顺序推进 / 移出）— 非导入核心
```

### `src/importers/epub/` 文件职责

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `ParsedEpub`、`EpubBookManifestV1`、`ImportEpub*`（含 `signal`/`preParsed`）、`EPUB_PROP`、`BookIRPlanV1`、`EpubValidationError` |
| `fingerprint.ts` | `computeSha256Hex`（Web Crypto 或纯 JS 回退） |
| `epubLimits.ts` | 压缩体积 / ZIP 条目 / 解压累计 / 单章 HTML / 图片 / 章节数 / 压缩比预算；`throwIfAborted` |
| `epubSanitize.ts` | **安全边界** `sanitizeEpubHtmlForImport`（白名单标签、去 on*/style/srcdoc、拒 SVG/危险协议） |
| `epubMime.ts` | 图片扩展名 + 魔数校验；默认拒绝 SVG |
| `epubParser.ts` | ZIP/OPF/spine/nav/NCX、`parseEpub`、预算与 signal、`getChapterContent`（严格清洗） |
| `epubHtml.ts` | HTML 根节点、标题合并/去重、图片 src 改写（rewrite 失败则 **移除** img）；`sanitizeHtmlForOrca` 仅为 Orca 兼容 |
| `epubAssets.ts` | 章节内图片上传（拒外部/data/blob、MIME 校验）；`uploadSourceEpub` / `loadSourceEpubBuffer` |
| `epubManifestChapters.ts` | 从 manifest 列已导入章节；`isPartialEpubImport` |
| `manifest.ts` | **严格** `parseEpubManifest` / `serializeEpubManifest`（禁止静默兜底） |
| `epubBookRepository.ts` | 书籍壳、章节写入、属性、指纹查找、疑似重名、checkpoint |
| `orcaBookHelpers.ts` | 建书页/章节页、行内引用、导航 |
| `htmlOutline.ts` | HTML → heading/content token 流 + 空白清理 |
| `orcaOutlineImporter.ts` | token → 父子 block（`importHtmlAsOutline`） |
| `epubImportService.ts` | `importEpub` / `resumeEpubImport` / `previewParse` 编排 |
| `epubFixtures.ts` 等 | 测试夹具；`testDom.ts` 为测试 DOM |

### `src/components/epub-import/`

| 文件 | 职责 |
| --- | --- |
| `EpubImportDialogMount.tsx` | Valtio 开关 + `ModalOverlay` + Wizard |
| `EpubImportWizard.tsx` | 步骤机：file → title → chapters → progress → result → 可选 ir_setup |
| `EpubChapterSelector.tsx` | 章节多选 UI |
| `EpubImportProgress.tsx` | 进度展示 |
| `EpubImportResult.tsx` | 结果摘要与操作按钮 |
| `epubImportViewModel.ts` | 可测纯函数：默认书名、全选、result 文案、IR 排期预览文案等 |

## 数据契约

### 书籍块属性（`EPUB_PROP`）

| 属性 | 说明 |
| --- | --- |
| `epub.fingerprint` | 源文件 SHA-256（小写 hex），精确去重键 |
| `epub.sourceAssetPath` | 上传后的源 EPUB 资源路径（续传必需） |
| `epub.importStatus` | `importing` \| `partial` \| `complete` |
| `epub.manifest` | 版本化 JSON 字符串 `EpubBookManifestV1` |

### 章节块属性

| 属性 | 说明 |
| --- | --- |
| `epub.bookId` | 所属书籍 `blockId` |
| `epub.chapterKey` | 稳定身份：`spineIndex:normalizedHref`（碰撞时加 `#n`） |
| `epub.spineIndex` | spine 顺序 |
| `epub.href` | 源 href |

读写 manifest **必须**经 `parseEpubManifest` / `serializeEpubManifest`；禁止字符串拼接或静默兜底。非法 JSON / 错误 `version` 抛 `EpubValidationError`。

### `EpubBookManifestV1`（要点）

```text
version: 1
fingerprint, sourceFileName, sourceAssetPath
status: importing | partial | complete
bookBlockId
chapters[]: { key, spineIndex, href, title, blockId | null, status: pending|imported|failed, error }
```

导入结果 `ImportEpubResult.kind`：`created` | `resumed` | `already_exists`。

进度相位 `ImportEpubPhase`：`parsing` | `dedupe` | `uploading_source` | `creating_book` | `importing_chapters` | `complete` | `partial` | `already_exists`。

## 流程

### 向导步骤（`WizardStep`）

1. **file**：选 `.epub` → `arrayBuffer` → `parseEpub`（指纹 + metadata + 章节列表）
2. **title**：默认书名 `defaultBookTitle(metadata.title, fileName)`
3. **chapters**：默认全选；可过滤后开始导入
4. **progress**：`importEpub({ buffer, sourceFileName, bookTitle, selectedChapterKeys, onProgress })`
5. **result**：完成 / 部分失败 / 已存在；可「继续导入」或「继续创建渐进阅读书籍」
6. **ir_setup**（可选）：独立章节多选 + `distributed` | `sequential` + priority / totalDays → `initializeBookIR`

### `importEpub` 编排要点

1. `computeSha256Hex(buffer)`；`findBookByFingerprint` 命中 → 导航到已有书，`kind: "already_exists"`，**不新建**
2. `EpubParser.load` → 按 `selectedChapterKeys` 过滤章节；空选择抛 `no_chapters`
3. `findSuspectedDuplicatesByTitle`（同名不同指纹）仅提示，不自动合并
4. **先** `uploadSourceEpub`；失败则 **不创建任何笔记**（`source_upload`）
5. `createBookShell`：书页、作者/简介、「章节:」标题、初始 manifest（章节多为 `pending`）
6. 逐章：`getChapterContent`（图片上传进 Orca 资产）→ `importOneChapter`（章节页 + outline + 行内引用）→ 写回 manifest checkpoint
7. 部分失败 → `partial` + 失败项；全部成功 → `complete`
8. 导航回书籍页；可选 `suspectedDuplicates` 通知

### `resumeEpubImport`

1. `loadManifestFromBook`；无 `sourceAssetPath` 则失败
2. `loadSourceEpubBuffer` 后校验指纹与 manifest 一致，否则停止且不改清单
3. 跳过已 `imported`；对 `pending`/`failed` 重试
4. 可从结果页「继续导入」或块菜单 / 命令 `resumeEpubImport` 触发

章节选择会过滤 EPUB 纯封面包装页。前置页不在目录中时，尝试 HTML 标题与首段短文本，避免无意义的 `Chapter N`。

### 章节标题来源与优先级

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | EPUB 3 nav TOC | 链接相对 **nav 文件目录** 解析（`../`、fragment、URL 编码），匹配 spine 后写标题 |
| 2 | EPUB 2 NCX | nav 零匹配或部分匹配时补齐**尚未有标题**的章节；不覆盖已有有效目录标题 |
| 3 | 正文 heading | 仅当目录标题缺失，或正文能提供更完整语义标题时使用；**纯数字 / 纯编号**（如 `1`、`Chapter 1`、`PART I`）不得覆盖有效目录标题 |
| 4 | 文档 fallback | 无 heading 时用 `<title>` 或首段短文本；仍无则未命名章节类 fallback |

正文开头若为连续的「编号 heading + 章名 heading」（如 `<h1>1</h1><h1>WHY LOGIC?</h1>`），会合并为可读标题，且不把后续小节标题并入章节名。

nav 与 spine 比较前统一规范化：去 fragment、处理 `.` / `..`、前导斜杠与反斜杠、尽力 URL 解码（畸形编码不抛错）。实现见 `normalizeComparableHref` / `preferChapterTitle` / `isNumberingOnlyTitle`。

## 正文 outline 结构

章节 HTML：`getChapterContent`（去页标题 heading、改写图片、sanitize）→ `htmlOutline` → `orcaOutlineImporter.importHtmlAsOutline`，形成**父子 block 层级**，而非章节页下扁平列表。

### 标题归属

| 规则 | 说明 |
| --- | --- |
| 栈式父级 | 章节页为虚拟 level 0；`hN` 成为最近 level `< N` 的标题（或章节页）的子 block |
| 正文归属 | 标题之后的段落/列表/引用/图片归属于当前标题，直到同级或更高级标题出现 |
| 级别跳跃 | 例如 h1 后直接 h3：挂到最近更浅父级，不合成中间标题 |
| 页面标题去重 | 仅移除与章节页标题**等价**的开头标题：单个匹配 `h1`，或开头连续「编号 + 章名」两 heading 合并后与页标题等价时两者都移除；不匹配则全部保留（含 `h2`–`h6`） |

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

- 忽略纯空白文本与只含空格 / 换行 / NBSP / 无意义 `<br>` 的段落与布局容器
- 连续空段落不会生成多个空 block
- 非空正文内部的 `<br>` 保留
- **保留** `<hr>`、含图片/脚注标记/列表/引用等有效内容的节点
- `div` / `section` 等排版容器会被拍平，避免空壳容器污染 outline

## 去重策略

- **同指纹**：不新建，打开已有（`already_exists`）
- **同名不同指纹**：仅 `suspectedDuplicates` 提示，不自动关联
- **不用** `batchId` 作为书籍身份
- 指纹查找：优先 backend property query，失败则扫描已加载 `orca.state.blocks`

## 与 BookIR / 笔记的衔接（仅代码中存在的）

| 点 | 说明 |
| --- | --- |
| 普通导入产物 | 书籍根页 + 元数据子块 +「章节:」下对章节页的引用；章节为独立页 + outline 正文 |
| 结果页 IR | `EpubImportWizard` → `initializeBookIR` / `retryFailedBookIRInit`；模式 `distributed` \| `sequential` |
| 契约共用 | `BookIRPlanV1`、`IR_BOOK_PLAN_PROP`（`ir.bookPlan`）定义在 `importers/epub/types.ts`，实现在 `src/srs/book-ir/` |
| 独立 IR 对话框 | `IRBookDialogMount` 也可对已导入书初始化 IR（复用 view-model 的 `schedulePreviewText`） |
| 详细 IR 行为 | 见 [渐进阅读_BookIR.md](./渐进阅读_BookIR.md) |

## 测试

| 文件 | 覆盖方向 |
| --- | --- |
| `src/importers/epub/epubParser.test.ts` | 解析、标题、nav/NCX、封面过滤等 |
| `src/importers/epub/epubImportService.test.ts` | 导入 / 续传 / 去重 / 上传失败不建笔记 |
| `src/importers/epub/htmlOutline.test.ts` | 标题 token、空白清理、语义保留 |
| `src/importers/epub/orcaOutlineImporter.test.ts` | insertBlock 父子与顺序 |
| `src/components/epub-import/epubImportViewModel.test.ts` | 向导纯函数 |

## 相关文件

- `src/importers/epub/*`
- `src/components/epub-import/*`
- `src/srs/book-ir/bookIRService.ts`（第二阶段入口）
- `src/srs/registry/commands.ts` / `uiComponents.tsx` / `contextMenuRegistry.tsx`
- `模块文档/渐进阅读_BookIR.md`
