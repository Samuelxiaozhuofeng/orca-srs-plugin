# PR2: 复习进度追踪功能

## 功能描述

为 SRS 复习系统添加会话级别的进度追踪功能。当复习会话结束时，显示详细的统计摘要，帮助用户了解本次复习的表现和学习进度。

## 新增功能

### 1. 会话统计摘要

复习结束时显示以下统计信息：
- **复习卡片数**：本次会话复习的卡片总数
- **准确率**：(Hard + Good + Easy) / 总评分数，以百分比显示
  - ≥80%：绿色
  - ≥60%：黄色
  - <60%：红色
- **总时长**：会话总时长，格式为 HH:MM:SS
- **平均每卡耗时**：有效复习时长 / 卡片数，以秒为单位
- **评分分布条**：彩色可视化显示各评分的分布
  - Again：红色
  - Hard：黄色
  - Good：绿色
  - Easy：蓝色

### 2. 有效复习时长计算

- 单卡复习时间超过 60 秒时，该卡片的时间按 60 秒计入有效复习时长
- 有效复习时长与总时长差异较大时，会额外显示有效复习时长

### 3. 进度自动保存

- 复习进度自动保存到 sessionStorage
- 刷新页面后可恢复进度（如果会话未结束）

## 新增文件

### 1. `src/srs/sessionProgressTracker.ts`

纯函数模块，包含所有计算逻辑：

```typescript
// 类型定义
interface SessionProgressState {
  version: number
  sessionStartTime: number
  gradeDistribution: GradeDistribution
  totalGradedCards: number
  effectiveReviewTime: number
  cardDurations: number[]
}

interface GradeDistribution {
  again: number
  hard: number
  good: number
  easy: number
}

interface SessionStatsSummary {
  totalReviewed: number
  totalSessionTime: number
  effectiveReviewTime: number
  averageTimePerCard: number
  accuracyRate: number
  gradeDistribution: GradeDistribution
}

// 核心函数
export function createInitialProgressState(): SessionProgressState
export function recordGrade(state, grade, duration): SessionProgressState
export function calculateAccuracyRate(distribution): number
export function calculateEffectiveDuration(duration): number
export function generateStatsSummary(state, endTime): SessionStatsSummary
export function formatDuration(milliseconds): string
export function formatAccuracyRate(rate): string
export function serializeProgressState(state): string
export function deserializeProgressState(json): SessionProgressState
```

### 2. `src/hooks/useSessionProgressTracker.ts`

React Hook，封装状态管理和副作用：

```typescript
interface UseSessionProgressTrackerReturn {
  progressState: SessionProgressState
  accuracyRate: number
  recordGrade: (grade: Grade) => void
  resetSession: () => void
  finishSession: () => SessionStatsSummary
  serialize: () => string
  restore: (json: string) => boolean
}

export function useSessionProgressTracker(options?): UseSessionProgressTrackerReturn
```

### 3. `src/components/GradeDistributionBar.tsx`

评分分布可视化组件：

```typescript
interface GradeDistributionBarProps {
  distribution: GradeDistribution
  showLabels?: boolean  // 是否显示数字标签和图例
  height?: number       // 容器高度，默认 24px
}
```

特点：
- 使用 CSS Flex 布局，无需图表库
- 支持 hover 显示详细信息
- 空状态显示"暂无评分数据"

## 修改文件

### `src/components/SrsReviewSessionDemo.tsx`

1. **导入新模块**
```typescript
import type { SessionStatsSummary } from "../srs/sessionProgressTracker"
import { formatDuration, formatAccuracyRate } from "../srs/sessionProgressTracker"
import { useSessionProgressTracker } from "../hooks/useSessionProgressTracker"
import GradeDistributionBar from "./GradeDistributionBar"
```

2. **集成 Hook**
```typescript
const {
  progressState,
  accuracyRate,
  recordGrade: recordProgressGrade,
  resetSession: resetProgressSession,
  finishSession: finishProgressSession,
} = useSessionProgressTracker({ autoSave: true })
```

3. **在评分时记录进度**
```typescript
// 在 handleGrade 函数中
setReviewedCount((prev) => prev + 1)
recordProgressGrade(grade)  // 新增
```

4. **更新会话结束界面**

原来只显示复习卡片数，现在显示完整的统计摘要：
- 2x2 网格布局显示核心数据
- 评分分布条可视化
- 准确率颜色编码

## 截图预览

会话结束界面布局：

```
        🎉
   本次复习结束！

┌─────────────────────────────┐
│  28        85.7%           │
│ 复习卡片    准确率          │
│                            │
│ 00:15:32    33s            │
│  总时长    平均每卡         │
│                            │
│      评分分布              │
│ [████████████████████████] │
│ Again:2 Hard:3 Good:18 Easy:5 │
└─────────────────────────────┘

    坚持复习，持续进步！

   [再复习一轮]  [完成]
```

## 测试建议

1. **基本功能测试**
   - 开始复习 → 评分若干卡片 → 完成复习 → 验证统计数据正确

2. **准确率计算测试**
   - 全部评 Again → 准确率应为 0%
   - 全部评 Good → 准确率应为 100%
   - 混合评分 → 验证计算正确

3. **时间统计测试**
   - 快速复习 → 验证平均时间合理
   - 中途暂停超过 60 秒 → 验证有效时长被正确截断

4. **进度恢复测试**
   - 复习中途刷新页面 → 验证进度被恢复

5. **重复复习模式测试**
   - 完成一轮 → 点击"再复习一轮" → 验证统计被重置

## 相关文件

- `src/srs/sessionProgressTracker.ts` (新增)
- `src/hooks/useSessionProgressTracker.ts` (新增)
- `src/components/GradeDistributionBar.tsx` (新增)
- `src/components/SrsReviewSessionDemo.tsx` (修改)
- `.kiro/specs/review-progress-tracking/` (设计文档)
