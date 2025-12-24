# 困难卡片集合功能

## 功能概述

困难卡片集合功能可以自动识别和收集经常遗忘的卡片，帮助用户集中攻克学习难点。

## 困难卡片判定标准

系统会根据以下三个维度自动识别困难卡片：

### 1. 频繁遗忘 (high_again_rate)
- 最近 10 次复习中按了 3 次以上 Again
- 表示短期内记忆不稳定

### 2. 遗忘次数多 (high_lapses)
- 总遗忘次数（lapses）达到 3 次以上
- 表示长期记忆困难

### 3. 难度较高 (high_difficulty)
- FSRS 算法计算的难度值达到 7 以上（满分 10）
- 表示卡片本身较难掌握

### 4. 多重困难 (multiple)
- 同时满足以上多个条件
- 需要重点关注

## 使用方式

### 入口
在 Flashcard Home 顶部工具栏点击「困难卡片」按钮

### 功能
1. **查看困难卡片列表**：按困难原因分类显示
2. **筛选**：可按困难类型筛选（全部/频繁遗忘/遗忘次数多/难度较高）
3. **一键复习**：点击「复习困难卡片」开始专项复习
4. **查看详情**：点击卡片可跳转到原始位置

## 技术实现

### 核心模块
- `src/srs/difficultCardsManager.ts` - 困难卡片管理器
- `src/components/DifficultCardsView.tsx` - 困难卡片视图组件

### 主要 API

```typescript
// 获取困难卡片列表
getDifficultCards(pluginName: string, deckName?: string): Promise<DifficultCardInfo[]>

// 获取困难卡片统计
getDifficultCardsStats(pluginName: string): Promise<DifficultCardsStats>

// 获取困难卡片用于复习
getDifficultCardsForReview(pluginName: string, deckName?: string, limit?: number): Promise<ReviewCard[]>
```

### 数据结构

```typescript
interface DifficultCardInfo {
  card: ReviewCard           // 卡片信息
  reason: DifficultReason    // 困难原因
  recentAgainCount: number   // 最近 Again 次数
  totalLapses: number        // 总遗忘次数
  difficulty: number         // 难度值
  lastReviewDate: Date | null // 最后复习时间
}

type DifficultReason = 
  | "high_again_rate"    // Again 比例高
  | "high_lapses"        // 遗忘次数多
  | "high_difficulty"    // 难度值高
  | "multiple"           // 多重原因
```

## 配置常量

可在 `difficultCardsManager.ts` 中调整以下阈值：

| 常量 | 默认值 | 说明 |
|------|--------|------|
| RECENT_REVIEW_WINDOW | 10 | 最近复习次数窗口 |
| AGAIN_COUNT_THRESHOLD | 3 | Again 次数阈值 |
| LAPSES_THRESHOLD | 3 | 遗忘次数阈值 |
| DIFFICULTY_THRESHOLD | 7 | 难度值阈值 |
| REVIEW_LOG_DAYS | 30 | 复习记录查询天数 |

## 排序规则

困难卡片按以下优先级排序：
1. 多重困难 > 频繁遗忘 > 遗忘次数多 > 难度较高
2. 同类型按遗忘次数降序排列
