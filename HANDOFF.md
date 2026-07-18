# 项目交接文档

更新时间：2026-07-18（顺序 Book IR 恢复硬化）

## 2026-07-18 追加：归档入口后端真相与属性形状防护

- `performArchive` / `performSkipChapter` 在识别顺序书前以后端 `get-block` 读取 `ir.sourceBookId`，不再用可能过期的 `orca.state` 快照做最终判断。
- 支持 Orca 单元素数组属性；空、多元素或无效 `ir.sourceBookId` 显式报错，禁止误回退 `completeIRCard`。
- 回归测试覆盖状态快照落后、数组属性和后端读取失败；该文件聚焦测试 20 项通过。
- 本轮独立验证：`npm test` 通过（105 个测试文件、1115 项）；`npx tsc --noEmit` 通过；`npm run build` 通过并复制到 `/Users/samdagreat/Documents/orca/plugins/orca-srs/dist`。
- 当前 Codex 浏览器没有可认领的 Orca 页面标签，因此真实实例验证仍未完成。

## 2026-07-18 落地：顺序推进恢复合同 + plan 缓存 + 资料库发现

### 已实现（本轮，未 commit）

1. **SAC / 顺序推进失败恢复（P1）**
   - Fully active：backend 验证 `#card` + `ir.due` + 匹配 `ir.sourceBookId`
   - plan-save 失败：visible partial；检查点失败同时 log/报告原错误与检查点错误（无空 catch）
   - `retrySequentialActivation`：扫描 selected 上本书 IR，保留 plan 顺序最后一章，strip 旧 dual-live，收敛到单卡
   - 结果标志：`currentChapterRemoved` / `planPersisted`；会话 `leftCard` 跟 strip 成功与否
   - 正常路径仍为 activate-before-strip + today/tomorrow due

2. **Plan 读写缓存（P1）**
   - `bookIRPlanRepository` backend-first `get-block`；写后 `invalidateIrBlockCache` + `invalidateBlockCache`

3. **Partial UI（P1）**
   - `performArchive` / `performSkipChapter` 传播 sequential 标志
   - `IRSessionShell` 仅在 `outcome.leftCard` 时 `removeCurrent()`

4. **P2 输入与发现**
   - 创建 plan / parse 时 `selectedChapterIds` 去重
   - 激活下一章：兼容 fully active 复用；外国书 IR 显式失败
   - `sequentialBookRegistry`（repo-scoped localStorage，上限 500）：save sequential 注册，clear 注销
   - `loadSequentialBookTreeContexts` 合并 registry + live cards；零 live 卡仍可显示大纲
   - `irSourceTreeBuilder` 可为无卡顺序书创建 source 组 + 纯 placeholder

### 本轮验证（自动化）

```text
npx vitest run src/srs/book-ir/bookIRService.test.ts \
  src/srs/book-ir/bookIRPlanRepository.test.ts \
  src/srs/book-ir/sequentialBookRegistry.test.ts \
  src/srs/incremental-reading/irSessionService.archive.test.ts \
  src/srs/incremental-reading/irSequentialActiveCadence.test.ts \
  src/components/incremental-reading/workspace/loadSequentialBookTreeContexts.test.ts \
  src/components/incremental-reading/workspace/irSourceTreeBuilder.test.ts
npx tsc --noEmit
npm test
```

### 仍待真实 Orca 验证

- 人为制造 plan-save / strip 失败后 UI 是否保留当前卡、重试后是否单卡
- 全书完成后资料库是否仍显示顺序大纲（注册表路径）
- Proxy/`structuredClone` 在真实 `orca.state` 下的 payload 路径

---

## 任务背景

这是 Orca Note 的渐进阅读插件，当前重点是 EPUB Book IR 的顺序解锁模式。

用户最初发现：一本书选择“顺序解锁”后，同时只有一个章节是真实 IR 卡片。章节如果分多次阅读，普通 Topic 的间隔会过长；完成第一章后，资料库甚至会显示“没有匹配的渐进阅读卡片”。随后又发现，点击“完成本章”时出现 `An object could not be cloned.`，界面只显示“归档失败”。

当前目标是让顺序阅读更适合逐章阅读：当前章可以高频推进，资料库始终能看到书籍大纲，完成当前章时由用户决定下一章今天还是明天进入队列。

## 已完成的功能

### 1. 顺序激活章节的短节奏排期（SAC）

涉及：

- `src/srs/incremental-reading/irSchedulingHelpers.ts`
- `src/srs/incremental-reading/irSchedulingMutations.ts`
- `src/srs/incremental-reading/irSessionService.ts`
- `src/srs/incrementalReadingScheduler.ts`
- `src/srs/incremental-reading/irTypes.ts`
- `src/srs/incremental-reading/irStatePersistence.ts`

只有同时满足以下条件才启用 SAC：

1. 书籍 `ir.bookPlan.mode === "sequential"`
2. 当前块等于 `plan.activeChapterId`
3. 当前块存在 `ir.sourceBookId`

优先级对应的基础间隔目前是启发式规则：

```text
baseIntervalDays = 1 + 2 * (1 - priority / 100)
priority 0   -> 约 3 天
priority 50  -> 约 2 天
priority 100 -> 约 1 天
```

SAC 不影响普通 Topic、Extract、distributed Book IR。它还记录阅读断点指纹和停滞计数，避免用户反复点“下一篇”却没有阅读进展时一直保持极短间隔。

### 2. 创建渐进阅读书籍页面的顺序排期文案

涉及：

- `src/components/IRBookDialogMount.tsx`
- `src/components/epub-import/EpubImportWizard.tsx`
- `src/components/epub-import/epubImportViewModel.ts`
- `src/importers/epub/types.ts`

选择“顺序解锁”后，页面下方会动态解释优先级和推送节奏，替代原来只说明“同时仅 1 章激活”的静态文案。

### 3. 资料库显示完整顺序书大纲

涉及：

- `src/components/incremental-reading/workspace/loadSequentialBookTreeContexts.ts`
- `src/components/incremental-reading/workspace/irSourceTreeBuilder.ts`
- `src/components/incremental-reading/workspace/useIRWorkspaceLibrary.ts`
- `src/components/incremental-reading/workspace/IRLibraryChapterItem.tsx`
- `src/components/incremental-reading/workspace/irChapterPresentation.ts`
- `src/styles/ir-workspace.css`

实现方式：

- 从现有真实 IR 卡片的 `sourceBookId` 发现顺序书。
- 读取书籍 `ir.bookPlan` 和 `epub.manifest` 章节标题。
- 对没有真实 IR 卡片的章节创建仅用于 UI 的 placeholder。
- placeholder 不写 `#card`、不写 `ir.*`、不进 IR 队列、不进入批量选择或批量移除。
- 当前章节显示“当前激活”并高亮。
- pending 章节显示“未激活”并灰显。
- completed/skipped 章节显示“已完成”/“已跳过”。
- 默认“全部”视图显示完整顺序大纲；日期、类型、阶段、重要性等筛选不会把纯 placeholder 当成真实卡片。

### 4. 完成本章时选择下一章今天还是明天

涉及：

- `src/components/incremental-reading/IRSessionShell.tsx`
- `src/srs/incremental-reading/irSessionService.ts`
- `src/srs/book-ir/bookIRProgression.ts`
- `src/importers/epub/types.ts`
- `src/srs/incremental-reading/irSessionService.archive.test.ts`

顺序解锁的当前激活章点击“完成本章”后，会打开 `ModalOverlay`：

- **今天安排下一章**：下一章 `ir.due` 为本地今天 00:00，今天进入 IR 队列。
- **明天安排下一章**：下一章 `ir.due` 为本地明天 00:00，计划仍把它标记为 active，但今天不进入到期队列。
- **取消/关闭**：不清理当前章节，不推进计划。

普通 IR 卡片仍使用原来的 `ConfirmBox` 和 `completeIRCard`。

新增类型：`NextChapterSchedule = "today" | "tomorrow"`，通过 `performArchive(..., { nextChapterSchedule })` 显式传递，禁止使用隐式全局状态。跳过章节和重试激活默认使用 today。

### 5. structured clone 错误修复

涉及：

- `src/srs/book-ir/bookIRPlanRepository.ts`
- `src/srs/book-ir/bookIRChapterInit.ts`

根因是 Orca 状态中的 Proxy 对象可能被直接传给 `orca.commands.invokeEditorCommand`，导致 `An object could not be cloned.`。

当前处理：

- `parseBookIRPlan` 会物化 `selectedChapterIds` 和 `outcomes`。
- `saveBookIRPlan` 写入前通过 `toPlainJsonValue` 生成纯 JSON 数据。
- 章节初始化时会清理 tag data、BlockRef 和其他编辑器 payload，避免把 Proxy 直接传入 IPC。
- 非法 tag payload 会显式抛错，不能返回空数组假装成功。
- 顺序推进失败会继续向 UI 抛出底层错误，不再静默降级为普通 `completeIRCard`。

## 当前状态

- 代码已实现，工作区没有 commit。
- 当前工作区包含多个相关任务的未提交改动：SAC、创建页文案、资料库顺序大纲、本次完成本章选择和 clone 修复。不要只根据本次任务选择性恢复或覆盖文件。
- Grok 已作为主要实现者完成本次改动；Codex 已独立检查 diff，并修正了非法 tag data 静默返回空数组的问题以及测试 mock。

## 验证结果

最近一次完整验证：

```text
npm test
104 个测试文件，1079 项测试全部通过

npx tsc --noEmit
通过

npm run build
通过，dist 已复制到 /Users/samdagreat/Documents/orca/plugins/orca-srs/dist
```

本次核心测试覆盖：

- today/tomorrow due 日期和计划状态
- 取消不调用推进服务
- 普通卡片仍走普通归档
- 顺序推进错误继续向上抛出
- plan Proxy 物化后可以 `structuredClone`
- 章节初始化和计划写入 payload 可克隆

`git diff --check` 目前会提示部分 Markdown 行尾双空格。这些双空格是 Markdown 强制换行格式，不是代码错误；不要为了消除提示而随意改变文档排版，除非明确决定统一文档格式。

## 已知边界与待处理事项

### 1. 无真实 IR 卡片时的顺序书发现（本轮已落地注册表）

`loadSequentialBookTreeContexts` 合并 live `sourceBookId` 与 `sequentialBookRegistry`（localStorage，按 repo 隔离）。sequential `saveBookIRPlan` 时登记；`clearBookIRPlan` 时注销。仍**不**做全库 `get-all-blocks` 扫描。

边界：

- 注册表是发现索引，非权威；每次加载仍 `loadBookIRPlan` 校验。
- 从未在本机成功 save 过 plan 的库（例如仅手写 plan、或换机无 localStorage）仍可能漏发现，直到下一次 sequential save。
- 读 plan 失败不 prune；确认无 plan 才 prune 过期 id。

### 2. “明天”目前是明确的明天 00:00

用户说“根据算法安排到第二天”，当前实现将其解释为下一章 due 设为明天本地 00:00。它不是 FSRS 预测，也不是 SAC 的动态间隔。如果未来要改成真正的算法预测，需要先明确算法输入、预期时间和是否仍将 plan 标记为 active。

### 3. UI 检测顺序激活状态是异步的

`IRSessionShell` 通过 `isSequentialActiveChapter` 异步判断是否显示专用完成弹窗。当前已处理卡片切换时清除旧状态和旧弹窗，但新卡首次渲染到检测完成之间仍有短暂异步窗口。不要把 UI 是否显示按钮当作服务层安全边界；服务层仍必须重新读取并校验 `ir.bookPlan`。

## 2026-07-18 修复：完成本章后整本书退出复习队列

### 根因（已证实）

1. **主因：`advanceSequentialBook` 先 `completeIRCard(当前章)` 再 `initializeChapterAsTopicIR(下一章)`**  
   顺序模式全书只有一张真实 IR 卡。清理当前章后、下一章激活前存在 **零 IR 卡窗口**。若 next init 失败（或任何异常中断），plan 可能已 `activeChapterId=null`、当前章无 `#card`/`ir.*`，资料库又只靠 live `sourceBookId` 发现顺序书 → 整本书从复习队列/大纲消失。用户看到的「其它章渐进阅读标志也没了」与此一致：不是批量 `removeTag`，而是书级发现链断掉。

2. **次因：`tryAdvanceSequentialBook` 对 `ir.sourceBookId` 使用 `typeof === "number"`**  
   UI/`isSequentialActiveChapter` 用 `parseOptionalNumber` 可吃 string；会话推进用严格 number。若 Orca 把 Number 属性读成 string，会 **跳过 progression 并 plain `completeIRCard`**，同样只清当前章、不激活下一章。

3. **排除：完成本章路径不会调用 `removeBookFromIR` / `removeChaptersFromIR`。** `completeIRCard`/`deleteIRState`/`removeTag` 均为单 blockId。

### 修复

- `bookIRProgression.ts`：**activate-before-strip** — 先 init 下一章 → 写 plan（current completed + next active）→ 再 `completeIRCard(当前章)`。next init 失败则 **抛错且不改 plan/当前章**。
- `irSessionService.ts`：`sourceBookId` 改用 `parseOptionalNumber`；next init 错误继续向上抛，禁止 plain-complete。
- 回归测试：单章 strip 调用审计、ch2 激活身份、ch3 无关标签保留、next init 失败不脏状态、string bookId 仍走 progression。

### 验证

```text
npx vitest run src/srs/book-ir/bookIRService.test.ts src/srs/incremental-reading/irSessionService.archive.test.ts
npx tsc --noEmit
```

## 2026-07-18 修复：资料库刷新后 manifest 报错与书名回退

实机 Console 证实：书籍 `#10` 不在 `orca.state.blocks`，`get-block` 返回的 type=2 `epub.manifest` 是单元素字符串数组；数组内 JSON 完整有效。新激活章的 `ir.sourceBookTitle` 同时为 `null`，所以资料库报 `epub.manifest must be an object` 后只能显示“书籍 #10”。

修复：

- `epubBookRepository.getPropValue` 只解包恰好一个元素的 Orca 属性数组；多元素数组仍由严格 manifest 校验报错。
- 顺序推进与重试优先继承当前章书名，缺失时从书籍块 alias/text 恢复，再写入下一章 `ir.sourceBookTitle`。
- 资料库在当前 IR 卡没有 `sourceBookTitle` 时直接读取书籍块 alias/text，因此既有空标题卡无需再次推进即可恢复 header。
- 回归测试覆盖真实的单元素 manifest 数组、空标题推进和资料库书名兜底。

## 2026-07-18 修复：明天安排后下一章 IR 存在但 #card 消失

第二个实机数据库的 Console 证实：plan 正确将第三章标为 active，`ir.due` 正确为明天 00:00，全部 `ir.*` 与 IR 索引均存在，但章节后端 refs 和 `get-blocks-with-tags` 都没有 `#card`。手工再次执行同一 `insertTag` 后标签立即持久化，说明残缺发生在顺序推进的“初始化下一章 → 立即删除当前章同名标签”期间，而不是 due/plan 计算错误。

修复：

- `initializeChapterAsTopicIR` 写完标签和属性后从后端验证真实 `#card`；若缺失自动补写一次，仍缺失则抛错。
- `advanceSequentialBook` 清理当前章后再次验证下一章最终标签；若此时消失则自动补写，失败返回 visible partial 并记录 `lastError`。
- IR localStorage 索引键加入 `orca.state.repo`，不同数据库不再共享 block ID；旧的全局索引自然失效并由新库全量扫描重建。
- 回归测试模拟删除当前章时下一章标签同时消失，并验证自动恢复；另验证 repo 级索引隔离。

---

## 下一步计划

如果继续开发，建议按以下顺序：

1. 在 Orca 实际环境中测试：顺序书第一章完成时分别选择“今天安排下一章”和“明天安排下一章”。检查 `ir.due`、资料库状态、今日队列和第二天队列。
2. 人为制造下一章初始化失败、计划保存失败，确认 UI 显示具体错误且可通过重试恢复。
3. 检查 `orca.state.blocks` 使用真实 Proxy 时，`core.editor.insertTag`、`setRefData`、`setProperties` 三类 payload 都能正常执行。
4. 如果产品要求“即使整本书没有任何 IR 卡也始终出现在资料库”，设计顺序书索引/查询方案，再补实现和测试。
5. 最后再考虑是否提交 Git；当前用户没有要求提交，不要擅自 commit、push 或 reset。

## 绝对不要再踩的坑

1. **不要把 `orca.state` 中的 Proxy、React 事件、Map、Set 或组件 state 直接传给 `invokeEditorCommand`。** 先转换为纯 JSON/可 structured clone 数据。
2. **不要用空 catch、`return []`、`return null` 或普通归档回退来掩盖顺序推进错误。** 顺序计划可能已经写入 checkpoint，错误必须可见并可重试。
3. **不要把 pending 章节创建成真实 IR 卡片。** 资料库 placeholder 只负责展示，不能写 `#card`、`ir.due` 或进入队列。
4. **不要只按真实卡片构建顺序书 UI。** 顺序模式只有一个真实 Topic，必须结合 `ir.bookPlan.selectedChapterIds` 构建完整大纲。
5. **不要把 `totalDays` 当成顺序模式每章间隔。** 它在 distributed 模式用于首次分散 due；顺序模式主要依赖 SAC 和完成时的 today/tomorrow 选择。
6. **不要让 `performArchive` 在顺序推进失败后继续调用普通 `completeIRCard`。** 这会造成计划状态和卡片状态不一致。
7. **不要把“明天安排”误改成普通卡片的 FSRS/Topic 间隔，除非产品重新定义需求。** 当前合同就是本地明天 00:00。
8. **不要回滚工作区中其他未提交改动。** 这是共享工作区，SAC、资料库大纲和创建页文案都属于前序任务的一部分。
9. **不要把测试 mock 写成与生产类型不一致的 `{}`。** `buildCardTagData` 应返回标签数据数组，否则严格 payload 校验会正确失败。
10. **不要只相信 Grok 的自评。** 修改后必须独立查看 diff，并至少运行相关测试、`npx tsc --noEmit`；涉及构建时运行 `npm run build`。
