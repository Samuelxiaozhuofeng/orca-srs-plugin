# EPUB 导入

> 文档同步日期：2026-07-27
> 变更说明：**导入预览 + 结构标记**：章节步可预览正文（`getChapterPreview`，不上传图片）；每选中项可选 `page`（独立章节页+目录引用，可进 Book IR）或 `marker`（「章节:」下普通 h3 块，保留部/篇结构、不建独立页、不进 IR）；manifest `chapters[].role`；「短文建议为标记」。另：**章节粒度 `auto`（Sol A+C）**——整章容器不拆小节；前缀兜底；`chapterPlan`；旧 resume→`toc-fragments`。
> 2026-07-26：`epubBookRepository.getBlock` 改 **backend-first**（对齐 `bookIRPlanRepository` 范式）：优先后端 `get-block`，失败 `console.warn` 后回退 `orca.state`——`persistManifest` 后紧接的 `loadManifestFromBook` / `ensureChaptersHeading` / `ensureInlineReference` 写后读不再受旧 state 快照影响（旧行为会把已导入章节当 pending 重跑 / 重复建页）。回归：`epubBookRepository.test.ts`。另更正：工具栏 `importEpubButton` 已移除，导入入口为斜杠 / 命令面板。
> 2026-07-25：WP-07 **纯层**已落地严格 HTML 清洗、资源预算、MIME 魔数、解析层 AbortSignal；ZIP load 与 entry 解压完成后会再次检查取消。
> **未验收 / 证据阻塞**：`importEpub` / `resumeEpubImport` 写入链取消、超限图片「省略 vs 零写入拒绝」preflight、真机 Network 与 resume 一致性。
> 2026-07-19：ir_setup 重要性字段——用户文案「重要性」，三档绝对档位（20/50/80，默认中），选项来自 `importanceSetupOptions`（`irImportance.ts`）；存储仍写 `priority` → 各章 `ir.priority`。
> 2026-07-25：**logical fragment chapters** 已落地——同一 spine XHTML 在 nav/NCX 中有 ≥2 个不同 fragment 目录项时，展开为按目录顺序的逻辑章节；正文用 DOM Range 切片；无 fragment / 仅 1 个 fragment 的文件保持历史整文件章节与 key。标题补全阶段按源文件路径缓存原始 XHTML 字符串（同文件只 `getFile` 一次），逻辑章对缓存内容重新 parse + `sliceChapterByFragments` 后再提取 heading，避免重复预算计数与用第一章 heading 覆盖后续章。

## 概述

在 SRS 插件内将 EPUB 导入为**普通 Orca 笔记**（书籍页 + 独立章节页 + 有序引用），可选在结果页进入第二阶段 **渐进阅读（BookIR）** 初始化。

**硬边界**：`importEpub` / `resumeEpubImport` **不**创建 `#card`、**不**写 `srs.*`、**不**写 `ir.*` 排期。IR 仅由向导「继续创建渐进阅读书籍」或独立 IR 入口调用 `initializeBookIR`（`src/srs/book-ir/bookIRService.ts`）完成。

## 命令与入口

| 入口 | 标识 | 行为 |
| --- | --- | --- |
| 命令 | `${pluginName}.importEpub` | `showEpubImportDialog` 打开向导 |
| 命令 | `${pluginName}.resumeEpubImport` | 对指定 `bookBlockId` 调用 `resumeEpubImport`（块菜单也可触发） |
| 斜杠 | `${pluginName}.importEpub`（组 SRS / 标题「导入 EPUB」/ `ti ti-book-upload`） | 绑定 `importEpub`；旧工具栏 `importEpubButton` **已移除** |
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
| `epubParser.ts` | ZIP/OPF/spine/nav/NCX（层级 TOC）、`parseEpub`、预算与 signal、`getChapterContent`（严格清洗） |
| `epubChapterPlan.ts` | 章节粒度规划：`auto` / `spine` / `toc-fragments`；整章容器判定、实质前缀、前缀切片 |
| `epubHtml.ts` | HTML 根节点、标题合并/去重、图片 src 改写（rewrite 失败则 **移除** img）；`sanitizeHtmlForOrca` 仅为 Orca 兼容 |
| `epubAssets.ts` | 章节内图片上传（拒外部/data/blob、MIME 校验）；`uploadSourceEpub` / `loadSourceEpubBuffer` |
| `epubManifestChapters.ts` | 从 manifest 列已导入章节；`isPartialEpubImport` |
| `manifest.ts` | **严格** `parseEpubManifest` / `serializeEpubManifest`（禁止静默兜底） |
| `epubBookRepository.ts` | 书籍壳、章节写入、属性、指纹查找、疑似重名、checkpoint；内部 `getBlock` **backend-first**（后端失败 warn 后回退 `orca.state`），保证 manifest 写后读可信 |
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
| `epub.chapterKey` | 稳定身份：`spineIndex:normalizedHref`；逻辑章节为 `spineIndex:path#fragment`（碰撞时再加 `#n`） |
| `epub.spineIndex` | spine 顺序（逻辑章节共享原 spine 序号） |
| `epub.href` | 源 href（逻辑章节含 fragment） |

读写 manifest **必须**经 `parseEpubManifest` / `serializeEpubManifest`；禁止字符串拼接或静默兜底。非法 JSON / 错误 `version` 抛 `EpubValidationError`。

### `EpubBookManifestV1`（要点）

```text
version: 1
fingerprint, sourceFileName, sourceAssetPath
status: importing | partial | complete
bookBlockId
chapterPlan?: { version: 1; granularity: auto | spine | toc-fragments }  // 新导入必写；缺省=旧书
chapters[]: { key, spineIndex, href, title, blockId | null, status, error, role?: page|marker }
```

`role`：`page`（默认/缺省）= 独立章节页 + 目录行内引用，**可进渐进阅读**；`marker` = 挂在「章节:」下的普通标题块（可含短正文 outline），**不建独立页、不进 IR 章节多选**。

`resolveManifestChapterGranularity(manifest)`：有 `chapterPlan.granularity` 用其值；**缺省 → `toc-fragments`**（保证旧 fragment key 续传可解析，不会被 `auto` 收成整文件后标成「源中不存在」）。

导入结果 `ImportEpubResult.kind`：`created` | `resumed` | `already_exists`。

进度相位 `ImportEpubPhase`：`parsing` | `dedupe` | `uploading_source` | `creating_book` | `importing_chapters` | `complete` | `partial` | `already_exists`。

## 流程

### 向导步骤（`WizardStep`）

1. **file**：选 `.epub` → `arrayBuffer` → `parseEpub`（指纹 + metadata + 章节列表）
2. **title**：默认书名 `defaultBookTitle(metadata.title, fileName)`
3. **chapters**：默认全选；**点击章节预览正文**；每项可设 **单独成页** / **只作目录**（或「把短内容改成『只作目录』」）；再开始导入
4. **progress**：`importEpub({ buffer, sourceFileName, bookTitle, selectedChapterKeys, chapterRoles, onProgress })`
5. **result**：完成 / 部分失败 / 已存在；可「继续导入」或「继续创建渐进阅读书籍」
6. **ir_setup**（可选）：独立章节多选 + `distributed` | `sequential` + **重要性**三档 / totalDays → `initializeBookIR`
   - 用户字段名：**重要性**（非「优先级」）；选项 `importanceSetupOptions()`（`src/srs/incremental-reading/irImportance.ts`）
   - 绝对档位：`tierToPriority` 低=20 / 中=50（默认）/ 高=80；写入 `initializeBookIR({ priority })` → plan 与各章 `ir.priority`
   - 组件：`EpubIRSetupStep` + 共用 `IRImportanceSetupField`（`EpubImportWizard` 只负责步骤状态；与 `IRBookSetupDialog` 同一套档位语义）
   - 预览文案 `schedulePreviewText`：顺序模式展示「当前重要性：…」与 SAC 间隔，**不**暴露 0–100 数字；分散模式保留 totalDays 跨度，并简述重要性影响之后进队/再推、不改总天数

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

清单读取一致性：`loadManifestFromBook`（及 `ensureChaptersHeading` / `ensureInlineReference` 的书块读取）经 repository 内部 `getBlock` **backend-first**——`persistManifest` checkpoint 刚写入后立即 resume 也能读到最新章节状态；旧 state-first 读法会拿到旧快照，把已导入章节当 `pending` 重跑并重复建章节页（回归：`epubBookRepository.test.ts`）。注意 `ensureInlineReference` / `ensureChaptersHeading` 对**内层子块**的遍历仍走 `orca.state`（独立低危面，未改）。

章节选择会过滤 EPUB 纯封面包装页。前置页不在目录中时，尝试 HTML 标题与首段短文本，避免无意义的 `Chapter N`。

### 章节标题来源与优先级

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | EPUB 3 nav TOC | 链接相对 **nav 文件目录** 解析（`../`、fragment、URL 编码），匹配 spine 后写标题 |
| 2 | EPUB 2 NCX | nav 零匹配或部分匹配时补齐**尚未有标题**的章节；不覆盖已有有效目录标题 |
| 3 | 正文 heading | 仅当目录标题缺失，或正文能提供更完整语义标题时使用；**纯数字 / 纯编号**（如 `1`、`Chapter 1`、`PART I`）不得覆盖有效目录标题 |
| 4 | 文档 fallback | 无 heading 时用 `<title>` 或首段短文本；仍无则未命名章节类 fallback |

正文开头若为连续的「编号 heading + 章名 heading」（如 `<h1>1</h1><h1>WHY LOGIC?</h1>`），会合并为可读标题，且不把后续小节标题并入章节名。

**文件路径匹配**（`normalizeComparableHref`）：去 fragment、处理 `.` / `..`、前导斜杠与反斜杠、尽力 URL 解码（畸形编码不抛错）。**逻辑章节身份**另用 `resolveHrefTarget` / `extractHrefFragment` 保留并解码 fragment；勿用去 fragment 的结果当逻辑章节 key。

实现见 `normalizeComparableHref` / `resolveHrefTarget` / `preferChapterTitle` / `isNumberingOnlyTitle` / `planChapters` / `expandLogicalFragmentChapters`。

### 章节边界与粒度（`EpubChapterGranularity`）

| 模式 | 何时用 | 行为 |
| --- | --- | --- |
| **`auto`（默认，新导入/预览）** | 新书 | 见下表决策；兼容「一文件多并列章」与「一章文件 + 嵌套小节」 |
| **`toc-fragments`** | 旧 manifest 无 `chapterPlan` 的续传；强制复现历史 | 同文件 ≥2 fragment → 展开；丢弃整文件父 TOC 项 |
| **`spine`** | 内部/测试/故障恢复 | 每 spine XHTML 一章，不展开 fragment |

#### `auto` 决策（同一 spine 文件）

| 条件 | 结果 | chapterKey |
| --- | --- | --- |
| 0/1 个不同 fragment | 历史整文件章 | `spineIndex:path` |
| **整章容器**（强证据） | **不展开**，整文件一章，标题用父 TOC | `spineIndex:path` |
| 非整章，但有实质前缀 + 整文件父 TOC | **前缀章**（文件头→第一 fragment）+ fragment 章 | 前缀 `spineIndex:path`；小节 `…#fragment` |
| 其余（同文件多并列章等） | 历史 fragment 展开 | `spineIndex:path#fragment` |

**整章容器**须同时满足（不依赖「第 X 章」语言正则）：

1. TOC 层级：存在无 fragment 父项 `P`；该文件全部 fragment 均为 `P` 的后代  
2. 锚点存在且 TOC 顺序与 DOM 顺序一致（失败**抛错**，不静默）  
3. 第一 fragment 前有 heading，与 `P.title` 经 `titlesEquivalent` 等价  
4. 各 fragment 标题层级**严格深于**父 heading（如父 `h1`、子 `h3`）  
5. 确认：第一 fragment 前有**实质正文**（去 heading 后 ≥40 非空白字符，或含 img/table/blockquote/pre 等），**或** 同结构在 ≥2 个 spine 文件上重复  

TOC 采集保留 `id/parentId/depth/order`（nav 递归 `ol/li`，NCX 递归 `navPoint`）。

#### logical fragment 切片（展开时）

| 规则 | 说明 |
| --- | --- |
| TOC 优先 | EPUB 3 nav 优先；仅当 nav 对该文件不足 2 个 fragment 时才用 NCX |
| 0/1 fragment | 整文件：`href` 无 fragment、key `spineIndex:path` |
| 展开身份 | `href` 含 fragment；`key` = `spineIndex:path#fragment` |
| 正文切片 | 起始锚点 → 下一逻辑章 fragment 前；末章到文件末尾；DOM Range |
| 前缀切片 | `href` 无 fragment + 运行时 `endFragment`：`[0, endFragment)` |
| 锚点失败 | **抛错**（含 path/fragment），**绝不**退回整文件藏重复正文 |
| `endFragment` | 仅运行时；**不**写入 manifest |
| 预算 | `assertChapterCount` 在最终章节数组上执行 |
| 标题补全 | 按路径缓存 HTML；fragment/前缀切片后再提 heading |

**已导入旧书**不会自动改粒度；同指纹去重不重建。坏结果需**删书重导**。不要原地改 `chapterKey` 或合并章节页。

## 正文 outline 结构

章节 HTML：`getChapterContent`（逻辑章节先切片 → 去页标题 heading、改写图片、sanitize）→ `htmlOutline` → `orcaOutlineImporter.importHtmlAsOutline`，形成**父子 block 层级**，而非章节页下扁平列表。

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
| `src/importers/epub/epubParser.test.ts` | 解析、标题、nav/NCX、封面过滤、**同 XHTML 多 fragment 逻辑章节**（NCX/nav 参数化）、双目录不重复、单 fragment 不展开、锚点缺失报错、**切片级标题补全**（纯编号 TOC + 各段 heading） |
| `src/importers/epub/epubImportService.test.ts` | 导入 / 续传 / 去重 / 上传失败不建笔记 |
| `src/importers/epub/htmlOutline.test.ts` | 标题 token、空白清理、语义保留 |
| `src/importers/epub/orcaOutlineImporter.test.ts` | insertBlock 父子与顺序 |
| `src/components/epub-import/epubImportViewModel.test.ts` | 向导纯函数 |

相关 fixture：`buildEpubMultiFragmentChapters` / `buildEpubMultiFragmentDualTocNavWins` / `buildEpubSingleFragmentToc` / `buildEpubMultiFragmentNumberingTocWithSliceHeadings`（`epubFixtures.ts`）。

## 视觉规范

向导 UI 遵循 [SRS_UI设计规范.md](SRS_UI设计规范.md)（Apple HIG 基线）。样式类定义在 `src/styles/ai-card-dialog.css` 尾部的「导入向导」小节（该表已由 `src/main.ts` 导入，故未新建样式表）：`.srs-import-dialog*`、`.srs-chapter-selector*`、`.srs-import-progress*`、`.srs-import-result*`、`.srs-web-preview*`、`.srs-ui-locked`。

- 组件里**不得**用内联样式做视觉表现；唯一保留的内联量是 `EpubImportProgress` 进度条填充的百分比宽度（运行时动态几何量）。
- 忙碌 / 不可用的宿主 `Button` 用 `.srs-ui-locked` 表达（含 `pointer-events: none`，是行为契约的一部分）。
- 详细落地约定见 [SRS_AI模块.md](SRS_AI模块.md) 的「视觉规范」小节。

## 相关文件

- `src/importers/epub/*`
- `src/components/epub-import/*`
- `src/srs/book-ir/bookIRService.ts`（第二阶段入口）
- `src/srs/registry/commands.ts` / `uiComponents.tsx` / `contextMenuRegistry.tsx`
- `模块文档/渐进阅读_BookIR.md`
