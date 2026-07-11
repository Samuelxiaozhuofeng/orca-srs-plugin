# 渐进阅读 Book IR（建书 / 顺序 / 退出）

## 概述

在 EPUB 普通导入或已有书籍章节上，建立版本化阅读计划 `ir.bookPlan`，支持：

- **分散排期**（默认）：选中章节全部成为 Topic，第 1 章今天到期，其余按计划天数分散。
- **顺序解锁**：计划记录全部选择，但同时只激活一章；完成或跳过才解锁下一章。

## 持久化：`BookIRPlanV1`

写在**书籍块**属性 `ir.bookPlan`（JSON，严格校验）：

| 字段 | 说明 |
| --- | --- |
| `version` | 固定 `1` |
| `bookBlockId` | 稳定书籍身份 |
| `mode` | `distributed` \| `sequential` |
| `priority` / `totalDays` | 调度参数 |
| `selectedChapterIds` | 第二阶段选中的章节 |
| `activeChapterId` | 顺序模式当前章；无则 `null` |
| `outcomes` | 每章 `pending` \| `active` \| `completed` \| `skipped` \| `removed` |

解析失败必须显式报错，禁止猜测修复。

## 服务

| 服务 | 职责 |
| --- | --- |
| `bookIRService.initializeBookIR` | 两种模式初始化 + 写 plan |
| `bookIRProgression.advanceSequentialBook` | 完成/跳过 + 解锁下一章 |
| `bookIRRemovalService.removeBookFromIR` | 整本移出（`Promise.allSettled`） |
| `bookIRRemovalService.removeChaptersFromIR` | 章节批量移出；顺序激活章移出时**暂停**不静默推进 |

`bookIRCreator.setupBookIR` 为兼容门面，内部委托新服务。

## 顺序模式规则

- 锁定章：无 `#card` / 无 IR 调度属性 → 收集器不会入队。
- **仅**「完成本章」或「跳过本章并继续」调用 progression。
- 打开/阅读、推后、改优先级**不得**解锁下一章。
- `completed` 与 `skipped` 在 plan 中可区分。

会话入口：更多菜单「完成本章」/「跳过本章并继续」；命令 `{plugin}.skipSequentialChapter`。

## 退出语义

- 移出只清理 `#card`、`srs.*`、`ir.*` 与 IR 索引；**不删除**书籍/章节块、正文、图片、引用、`epub.*`。
- 整本移出入口：
  - 书籍页右键「将整本书移出渐进阅读」
  - 资料库筛选来源书后「整本移出来源书」
- 章节多选：资料库批量移出（同源书时走 `removeChaptersFromIR`）。
- 部分失败：报告成功/失败数，保留 plan，可重试失败项。
- 移出后可从普通笔记重新加入，无需重新导入 EPUB。

## 测试

- `src/srs/book-ir/bookIRService.test.ts`

## 相关文件

- `src/srs/book-ir/*`
- `src/srs/bookIRCreator.ts`（门面）
- `src/components/epub-import/EpubImportWizard.tsx`（第二阶段 UI）
- `模块文档/EPUB导入.md`
