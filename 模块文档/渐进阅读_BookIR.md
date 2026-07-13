# 渐进阅读 Book IR（建书 / 顺序 / 退出）

> **文档同步日期：2026-07-13**  
> 以 `src/srs/book-ir/*`、`src/srs/bookIRCreator.ts`、会话内顺序推进与右键/命令入口为实现真相。  
> 通用 IR 会话与工作区见 [`渐进阅读.md`](渐进阅读.md)。EPUB 纯笔记导入见 [`EPUB导入.md`](EPUB导入.md)。

## 概述

在 EPUB 普通导入结果或已有「书籍 + 章节引用」结构上，建立版本化阅读计划 `ir.bookPlan`（属性常量 `IR_BOOK_PLAN_PROP`），支持：

| 模式 | `mode` | 行为 |
| --- | --- | --- |
| **分散排期**（默认） | `distributed` | 选中章节**全部**初始化为 Topic IR；第 1 章 `due` 为今天，其余按 `totalDays` 分散 |
| **顺序解锁** | `sequential` | 计划记录全部 `selectedChapterIds`；**同时只激活一章**（写 `#card` + IR）；完成或跳过才解锁下一章 |

移出渐进阅读只清理卡片身份与调度，**不删除**笔记正文、图片、引用或 `epub.*` 溯源。

## 持久化：`BookIRPlanV1`

写在**书籍块**属性 `ir.bookPlan`：

- 写入类型：`PropType.JSON`（`0`），值为 JSON 对象
- 读取兼容：历史 JSON 字符串；以及 Orca 将旧 `PropType.BlockRefs`（`2`）文本读成的单元素数组（如 `["{...}"]`）
- 下一次完成/跳过/保存计划时会自动改写为正确 JSON 属性
- 真正的块引用 ID 数组无法还原计划 → 显式 `EpubValidationError`，要求清空后重新初始化
- `version` 必须为 `1`；其他版本拒绝解析（**禁止猜测修复**）

类型定义：`src/importers/epub/types.ts`（`BookIRPlanV1`）；仓库 re-export：`src/srs/book-ir/bookIRPlanTypes.ts`。  
解析/序列化：`src/srs/book-ir/bookIRPlanRepository.ts`（`parseBookIRPlan` / `loadBookIRPlan` / `saveBookIRPlan` / `clearBookIRPlan`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 计划 schema 版本，固定 1 |
| `bookBlockId` | `DbId` | 稳定书籍身份（不用 `batchId` 当书身份） |
| `mode` | `"distributed" \| "sequential"` | 排期/解锁模式 |
| `priority` | `number` | 章节 Topic 初始化优先级 |
| `totalDays` | `number` | 分散模式跨度（天） |
| `selectedChapterIds` | `DbId[]` | 第二阶段选中的章节，顺序即阅读/解锁顺序 |
| `activeChapterId` | `DbId \| null` | 顺序模式当前章；无激活则为 `null`（含暂停或刚完成章尚未激活下一章的检查点） |
| `outcomes` | `Record<string, BookIRChapterOutcome>` | 每章结果 |
| `lastError` | `string \| null`（可选） | 顺序下一章激活失败等可诊断错误 |

### 章节 outcome

| 值 | 含义 |
| --- | --- |
| `pending` | 计划内、尚未成为 Topic IR（顺序模式锁定章） |
| `active` | 当前已初始化为 Topic IR |
| `completed` | 用户「完成本章」 |
| `skipped` | 用户「跳过本章并继续」 |
| `removed` | 从 IR 移出（笔记仍在） |

解析失败必须抛 `EpubValidationError`（带 `code`，如 `plan_missing` / `plan_version` / `plan_corrupted_blockrefs`），禁止静默默认。

## 服务分层

| 模块 | 职责 |
| --- | --- |
| `bookIRService.initializeBookIR` | 两种模式初始化 + 写 plan；返回 `BookIRMutationResult` |
| `bookIRChapterInit.initializeChapterAsTopicIR` | 单章：`#card type=topic` + `ir.*`（含 `sourceBookId` / `batchId` 等）+ 入 IR 索引；**不**读写 plan / `epub.*` |
| `bookIRProgression.advanceSequentialBook` | 完成/跳过 + 检查点式解锁下一章；读/推后/改优先级**禁止**调用 |
| `bookIRProgression.retrySequentialActivation` | 下一章已 IR 但 plan `active=null` 时的修复 |
| `bookIRRemovalService.removeBookFromIR` | 整本移出（`Promise.allSettled`）；成功则 `clearBookIRPlan` |
| `bookIRRemovalService.removeChaptersFromIR` | 章节批量移出；顺序激活章被移出时**暂停**（`sequentialPaused`），**不**静默推进 |
| `bookIRRemovalService.retryRemoveChaptersFromIR` | 仅重试失败章节 ID |
| `bookIRRemovalConfirm` | 确认文案与调用封装（UI） |
| `bookIRCreator.setupBookIR` | 兼容门面 → `initializeBookIR({ mode: "distributed", ... })` |
| `bookIRCreator.calculateChapterDueDates` | 分散 due 计算 |
| `bookIRCreator.getChapterBlockIds(Async)` | 从书籍块 inline refs 发现章节（遗留 UI / 右键） |

请求/结果类型：`InitializeBookIRRequest`、`AdvanceSequentialBookRequest`、`BookIRMutationResult`（`kind`: `initialized` \| `advanced` \| `removed` \| `partial`）。

## 章节初始化（`initializeChapterAsTopicIR`）

对单个章节块：

1. 无 `#card` 则 `insertTag` + `type=topic`；已有则 `setRefData` 保证 `type=topic`
2. 写入 IR 属性：`priority`、`due`、`intervalDays`（按优先级基础间隔，**非**「到首次 due 的天数」）、`stage=topic.preview`、`lastAction=init`、`position`、`sourceBookId` / `sourceBookTitle`、可选 `batchId` / `batchCreatedAt` 等
3. `upsertIRIndexId` 增量入索引

分散模式：全部选中章初始化，`outcomes[id]=active`，`activeChapterId` 取成功列表第一项。  
顺序模式：仅第一选中章初始化为 `active`，其余保持 `pending`（无 `#card` / 无 IR 调度 → 收集器不会入队）。

## 顺序模式规则

- **锁定章**：`pending` → 无卡身份 → 不会进入 IR 队列
- **仅**「完成本章」或「跳过本章并继续」调用 `advanceSequentialBook`
- 打开/阅读、下一篇、推后、改优先级**不得**解锁下一章
- `completed` 与 `skipped` 在 plan 中可区分，但对解锁行为等价（都会尝试激活下一 `pending`）

### 推进状态机（检查点）

`advanceSequentialBook` 顺序（失败可重试）：

1. 校验 plan 存在、`mode=sequential`、且 `activeChapterId === request.chapterId`
2. **检查点 A**：写 plan — 记录 outcome，`activeChapterId = null`
3. `completeIRCard` 剥离当前章 IR 身份（失败则尝试恢复原 plan）
4. 找下一个 `pending` 章；若无则返回「全书完成/跳过完毕」
5. `initializeChapterAsTopicIR` 激活下一章（due=今天）
6. 写 plan — `outcomes[next]=active`，`activeChapterId=next`  
   若 5 成功而 6 失败：下一章已有 IR 但 plan 可能仍 `active=null` → `retrySequentialActivation` 可修复

会话侧：

- `performArchive`（`irSessionService.ts`）：若卡带 `ir.sourceBookId` 且为顺序激活章 → progression `completed`；否则普通归档
- `performSkipChapter`：仅顺序书；progression `skipped`
- UI：`IRSessionShell` 更多菜单「完成本章」/「跳过本章并继续」
- 命令：`{plugin}.skipSequentialChapter`（提示在会话内操作）

## 退出语义（移出 IR）

- 移出只清理 `#card`、`srs.*`、`ir.*` 与 IR 索引（经 `completeIRCard` / `stripChapterIR`）
- **不删除**书籍/章节块、正文、图片、引用、`epub.*`
- 身份以 **`bookBlockId` + `ir.bookPlan`** 为准，**不用** `ir.batchId` 当书身份

### 整本移出

入口：

- 书籍页右键「将整本书移出渐进阅读」（需块上已有 `ir.bookPlan`）→ 命令 `{plugin}.removeBookFromIR`
- 资料库筛选来源书后「整本移出来源书」

行为：

1. 目标章：plan 中 `outcomes !== removed` 的 `selectedChapterIds`；无 plan 时回退 epub manifest / `epub.bookId` 扫描
2. `Promise.allSettled` 逐章 `stripChapterIR`
3. 全成功：`clearBookIRPlan`；部分失败：保留 plan，`outcomes` 标记成功章为 `removed`，`lastError` 记录失败，可重试

### 章节批量移出

- 资料库多选批量移出；同源书时走 `removeChaptersFromIR`
- 若移出的包含**顺序模式当前激活章**：`activeChapterId=null`，`sequentialPaused=true`，**不**自动解锁下一章
- 若选中范围内已无剩余 active/pending 且无失败：清除 plan

移出后可从普通笔记/右键重新「创建渐进阅读书籍」，无需重新导入 EPUB。

## 用户入口

| 入口 | 实现 |
| --- | --- |
| EPUB 导入向导第二阶段 | `EpubImportWizard.tsx` → 建书参数 |
| 独立建书对话框 | `IRBookSetupDialog.tsx` + `IRBookDialogMount.tsx` |
| 右键「创建渐进阅读书籍」 | `contextMenuRegistry.tsx` → 章节 refs → `showIRBookDialog` |
| 右键整本移出 | 同上 + `removeBookFromIR` 命令 |
| 会话完成本章 / 跳过 | `IRSessionShell` + `irSessionService` |
| 资料库批量/整本移出 | `useIRWorkspaceLibrary` / bulk bar + removal 服务 |

## 测试

- `src/srs/book-ir/bookIRService.test.ts`（初始化、顺序推进、移出、plan 校验）
- `src/srs/book-ir/bookIRPlanRepository.test.ts`
- `src/srs/book-ir/bookIRRemovalConfirm.test.ts`

## 相关文件

- `src/srs/book-ir/bookIRService.ts`
- `src/srs/book-ir/bookIRChapterInit.ts`
- `src/srs/book-ir/bookIRProgression.ts`
- `src/srs/book-ir/bookIRPlanRepository.ts`
- `src/srs/book-ir/bookIRPlanTypes.ts`
- `src/srs/book-ir/bookIRRemovalService.ts`
- `src/srs/book-ir/bookIRRemovalConfirm.ts`
- `src/srs/bookIRCreator.ts`（门面 + 章节发现 + due 计算）
- `src/importers/epub/types.ts`（`BookIRPlanV1`、`IR_BOOK_PLAN_PROP`、mutation 类型）
- `src/srs/incremental-reading/irSessionService.ts`（顺序完成/跳过桥接）
- `src/components/incremental-reading/IRSessionShell.tsx`
- `src/components/IRBookSetupDialog.tsx` / `IRBookDialogMount.tsx`
- `src/components/epub-import/EpubImportWizard.tsx`
- `src/srs/registry/contextMenuRegistry.tsx` / `commands.ts`
- `模块文档/渐进阅读.md`
- `模块文档/EPUB导入.md`
