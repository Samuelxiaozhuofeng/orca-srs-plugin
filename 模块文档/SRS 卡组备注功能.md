# 卡组备注功能（历史摘要）

> **已合并 / 请参阅权威文档：[SRS_卡组备注.md](SRS_卡组备注.md)**  
> **文档类型：历史实现总结**（2026-07-13 降级）。下文仅保留路径与能力索引，细节以权威文档与代码为准。

## 摘要

为 Flash Home 卡组提供备注 CRUD，数据键 `deckNotes`，实现于：

- `src/srs/deckNoteManager.ts` — API
- `src/components/SrsFlashcardHome.tsx` — `loadData` 合并、`DeckRow` 编辑 UI
- `src/srs/types.ts` — `DeckInfo.note?`
- 演示：`src/components/DeckNoteDemo.tsx`

历史文中「卡片模式 / 表格模式双 UI」：代码仍含 `DeckCard`，**现行列表仅用 `DeckRow` 表格**。

## 维护说明

请勿在此文件继续扩展实现细节；变更请改 [SRS_卡组备注.md](SRS_卡组备注.md)。
