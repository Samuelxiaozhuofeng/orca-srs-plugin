# 动态复习队列更新功能

## 功能概述

实现了动态更新复习时的闪卡列表功能，让1分钟后到期的卡片能够自动出现在复习队列中，而不需要重新打开或完成一轮复习。

## 主要特性

### 1. 自动检查新到期卡片

- **检查频率**: 每60秒自动检查一次
- **检查范围**: 所有符合复习条件的卡片
- **智能过滤**: 只添加不在当前队列中的新到期卡片

### 2. 实时队列更新

- **无缝添加**: 新到期卡片自动添加到队列末尾
- **不中断复习**: 不影响当前正在复习的卡片
- **进度保持**: 保持当前复习进度和历史记录

### 3. 用户反馈

- **进度显示**: 在进度条中显示新增卡片数量（如：+3 新增）
- **日志提示**: 在复习界面显示发现新卡片的消息
- **系统通知**: 弹出通知告知用户新卡片已加入队列

### 4. 手动刷新

- **刷新按钮**: 在复习界面提供手动检查按钮
- **即时检查**: 用户可以随时手动检查新到期卡片
- **反馈明确**: 显示检查结果，无论是否有新卡片

## 技术实现

### 复习会话组件 (SrsReviewSessionDemo.tsx)

```typescript
// 自动检查定时器
useEffect(() => {
  let timeoutId: NodeJS.Timeout | null = null
  
  const checkForNewCards = async () => {
    // 获取最新的复习队列
    const allCards = await collectReviewCards(pluginName)
    const newQueue = buildReviewQueue(allCards)
    
    // 识别新卡片
    const currentCardIds = new Set(queue.map(card => 
      `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
    ))
    
    const newCards = newQueue.filter(card => {
      const cardKey = `${card.id}-${card.clozeNumber || 0}-${card.directionType || "basic"}`
      return !currentCardIds.has(cardKey)
    })
    
    // 更新队列
    if (newCards.length > 0) {
      setQueue(prevQueue => [...prevQueue, ...newCards])
      setNewCardsAdded(prev => prev + newCards.length)
      setLastLog(`发现 ${newCards.length} 张新到期卡片已加入队列`)
    }
  }

  // 每60秒检查一次
  timeoutId = setTimeout(checkForNewCards, 60000)
  return () => clearTimeout(timeoutId)
}, [pluginName])
```

### Flash Home 组件 (SrsFlashcardHome.tsx)

```typescript
// 自动刷新统计数据
useEffect(() => {
  const autoRefresh = async () => {
    // 静默刷新数据
    const cards = await collectReviewCards(pluginName)
    const newStats = calculateHomeStats(cards)
    
    // 检查是否有新的到期卡片
    if (newStats.pendingCount > todayStats.pendingCount) {
      console.log(`发现新到期卡片，从 ${todayStats.pendingCount} 增加到 ${newStats.pendingCount}`)
    }
    
    // 更新状态
    setAllCards(cards)
    setTodayStats(newStats)
  }

  // 每2分钟刷新一次
  const interval = setInterval(autoRefresh, 120000)
  return () => clearInterval(interval)
}, [pluginName, todayStats.pendingCount])
```

## 用户体验

### 复习过程中

1. **无感知更新**: 用户正常复习，系统在后台自动检查新卡片
2. **及时通知**: 发现新卡片时显示通知和进度更新
3. **连续复习**: 可以连续复习而不需要重新打开复习界面

### 主页统计

1. **实时更新**: 主页统计数据每2分钟自动刷新
2. **准确反映**: 始终显示最新的到期卡片数量
3. **静默刷新**: 不影响用户当前操作

## 性能考虑

### 优化策略

1. **智能检查**: 只检查真正新增的卡片，避免重复处理
2. **合理频率**: 复习界面60秒检查，主页120秒刷新
3. **错误处理**: 检查失败时静默处理，不影响用户体验
4. **资源清理**: 组件卸载时清理所有定时器

### 内存管理

1. **避免内存泄漏**: 使用 useEffect 清理函数
2. **状态优化**: 只更新必要的状态
3. **事件清理**: 正确注册和取消事件监听器

## 使用场景

### 典型场景

1. **长时间复习**: 用户进行长时间复习会话时，新卡片自动加入
2. **分批学习**: 用户设置了分批推送的 Cloze 或 Direction 卡片
3. **定时复习**: 用户设置了特定时间到期的卡片

### 边界情况

1. **网络异常**: 检查失败时不影响当前复习
2. **数据异常**: 无效卡片被自动过滤
3. **并发操作**: 多个检查操作不会冲突

## 配置选项

当前实现使用固定的检查间隔，未来可以考虑添加配置选项：

- 检查频率设置（30秒 - 5分钟）
- 通知开关
- 自动添加开关

## 兼容性

- 兼容所有卡片类型（Basic、Cloze、Direction、Excerpt）
- 兼容现有的复习流程
- 不影响现有的 SRS 算法和数据结构