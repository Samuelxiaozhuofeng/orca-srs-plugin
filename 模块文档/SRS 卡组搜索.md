# 卡组搜索功能（历史摘要）

> **已合并 / 请参阅权威文档：[SRS_卡组搜索.md](SRS_卡组搜索.md)**  
> **文档类型：历史实现总结**（2026-07-13 降级）。下文仅保留路径与能力索引，细节以权威文档与代码为准。

## 摘要

Flash Home 卡组列表内实时搜索名称与备注，高亮匹配，`Escape` 清空。实现于：

- `src/components/flashcard-home/DeckListView.tsx` — 过滤与统计
- `src/components/flashcard-home/HighlightText.tsx` — 高亮
- 演示 `DeckSearchDemo` 已删除

历史文中「Ctrl+F 全局快捷键」**已移除**；勿再按该快捷键文档行为验收。

## 维护说明

请勿在此文件继续扩展实现细节；变更请改 [SRS_卡组搜索.md](SRS_卡组搜索.md)。
