# Flash Home 顶部统计卡片实现

## 🎯 功能概述

在 Flash Home 界面顶部添加了三个统计卡片，直观显示用户的学习状态：未学习、学习中、待复习。

## 📊 统计卡片

### 1. 未学习（蓝色）
- **数据来源**：`todayStats.newCount`
- **含义**：新卡数量，从未复习过的卡片
- **颜色**：`var(--orca-color-primary-6)` （蓝色）
- **用途**：显示可学习的新内容数量

### 2. 学习中（红色）
- **数据来源**：`todayStats.todayCount`
- **含义**：今天到期的复习卡片数
- **颜色**：`var(--orca-color-danger-6)` （红色）
- **用途**：显示今天需要完成的复习任务

### 3. 待复习（绿色）
- **数据来源**：`todayStats.pendingCount - todayStats.todayCount`
- **含义**：已到期但不是今天到期的卡片（积压任务）
- **颜色**：`var(--orca-color-success-6)` （绿色）
- **用途**：显示需要优先处理的积压复习

## 🔧 技术实现

### 代码位置
在 `src/components/SrsFlashcardHome.tsx` 的 `DeckListView` 组件中添加。

### 实现代码
```tsx
{/* 顶部统计卡片 */}
<div style={{
  display: "flex",
  gap: "12px",
  justifyContent: "center",
  flexWrap: "wrap"
}}>
  <StatCard 
    label="未学习" 
    value={todayStats.newCount} 
    color="var(--orca-color-primary-6)" 
  />
  <StatCard 
    label="学习中" 
    value={todayStats.todayCount} 
    color="var(--orca-color-danger-6)" 
  />
  <StatCard 
    label="待复习" 
    value={todayStats.pendingCount - todayStats.todayCount} 
    color="var(--orca-color-success-6)" 
  />
</div>
```

### 数据来源
统计数据来自 `calculateHomeStats` 函数计算的 `TodayStats`：

```typescript
export type TodayStats = {
  pendingCount: number  // 所有待复习卡片数（已到期 + 今天到期）
  todayCount: number    // 今天到期的复习卡片数
  newCount: number      // 新卡数量
  totalCount: number    // 总卡片数
}
```

### StatCard 组件
复用现有的 `StatCard` 组件，具有统一的视觉风格：

```tsx
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "12px 16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minWidth: "80px"
    }}>
      <div style={{
        fontSize: "24px",
        fontWeight: 600,
        color: color || "var(--orca-color-text-1)"
      }}>
        {value}
      </div>
      <div style={{
        fontSize: "12px",
        color: "var(--orca-color-text-3)",
        marginTop: "4px"
      }}>
        {label}
      </div>
    </div>
  )
}
```

## 🎨 设计特点

### 1. 视觉层次
- **位置**：位于界面顶部，最先映入眼帘
- **布局**：水平居中排列，响应式设计
- **间距**：12px 间距，保持视觉平衡

### 2. 颜色语义
- **蓝色（未学习）**：代表新内容，学习的起点
- **红色（学习中）**：代表紧急任务，需要今天完成
- **绿色（待复习）**：代表积压任务，需要优先处理

### 3. 响应式设计
- **flexWrap: "wrap"**：小屏幕时自动换行
- **justifyContent: "center"**：始终保持居中对齐
- **minWidth: "80px"**：确保卡片有足够的显示空间

## 📱 用户体验

### 1. 一目了然
用户打开 Flash Home 后立即看到学习状态概览，无需滚动或点击。

### 2. 优先级指导
通过颜色和数值帮助用户理解学习优先级：
1. 绿色（待复习）- 最高优先级，处理积压
2. 红色（学习中）- 中等优先级，完成今日计划
3. 蓝色（未学习）- 较低优先级，学习新内容

### 3. 学习动机
- **成就感**：看到数字减少时的满足感
- **紧迫感**：红色和绿色数字提醒及时复习
- **进度感**：直观了解学习进度和剩余任务

## 📊 数据逻辑

### 统计计算逻辑
基于 `calculateHomeStats` 函数的实现：

```typescript
// 遍历所有卡片
for (const card of cards) {
  if (card.isNew) {
    newCount++  // 新卡
  } else {
    const dueDate = card.srs.due
    if (dueDate < tomorrow) {
      pendingCount++  // 待复习（包括今天和已到期）
      if (dueDate >= today && dueDate < tomorrow) {
        todayCount++  // 今天到期
      }
    }
  }
}
```

### 待复习计算
```typescript
// 待复习 = 所有待复习 - 今天到期 = 已到期但不是今天
const overdueCount = todayStats.pendingCount - todayStats.todayCount
```

## 🚀 未来扩展

### 1. 交互功能
- 点击统计卡片直接筛选对应类型的卡片
- 添加趋势图显示学习进度变化
- 支持自定义统计时间范围

### 2. 个性化
- 允许用户自定义颜色主题
- 支持隐藏/显示特定统计卡片
- 添加学习目标设置和进度跟踪

### 3. 智能提醒
- 基于统计数据提供学习建议
- 积压过多时的智能提醒
- 学习习惯分析和优化建议

## 📝 总结

顶部统计卡片的添加显著提升了 Flash Home 的信息密度和用户体验：

- ✅ **信息直观**：一眼看清学习状态
- ✅ **优先级清晰**：颜色编码指导学习顺序
- ✅ **设计统一**：与整体界面风格保持一致
- ✅ **响应式**：适配不同屏幕尺寸
- ✅ **性能优化**：复用现有数据，无额外计算

这个功能让用户能够快速了解自己的学习状态，更好地规划学习时间和优先级，提高学习效率。