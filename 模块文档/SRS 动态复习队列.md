# 动态复习队列更新功能

## 功能概述

实现了动态更新复习时的闪卡列表功能，让会话进行中新到期的卡片能够自动出现在复习队列中，而不需要重新打开或完成一轮复习。

**FC-02 起**：动态追加必须遵守会话启动时冻结的 `sessionScope`，不得在会话中途混入范围外的牌组或卡片。

**FC-01 起**：动态追加还必须遵守会话启动时冻结的正式根卡每日额度（`sessionDailyLimits` + `SessionRootCardBudget`）；先 scope，再剩余额度。

## 主要特性

### 1. 自动检查新到期卡片

- **检查频率**: 每60秒自动检查一次
- **检查范围**: 受 `ReviewSessionScope` 约束（见下）
- **智能过滤**: 只添加不在当前队列中、且属于当前 scope、且未超会话额度的新到期**正式根卡**
- **fixed 模式**: 完全跳过全库 `collectReviewCards`，不偷偷扫描；**不限额**

### 2. 实时队列更新

- **无缝添加**: 新到期卡片自动添加到队列末尾
- **不中断复习**: 不影响当前正在复习的卡片
- **进度保持**: 保持当前复习进度和历史记录

### 3. 用户反馈

- **进度显示**: 在进度条中显示新增卡片数量（如：+3 新增）
- **日志提示**: 在复习界面显示发现新卡片的消息
- **系统通知**: 弹出通知告知用户新卡片已加入队列
- **失败可见**: 检查失败时 `console.error` 并 `orca.notify` 错误提示

### 4. 手动刷新

- **刷新按钮**: 在复习界面提供手动检查按钮
- **即时检查**: 用户可以随时手动检查新到期卡片
- **反馈明确**: 显示检查结果，无论是否有新卡片
- **fixed 模式**: 返回「专项训练使用固定卡片集合」，不执行全库扫描

## 会话范围（sessionScope）

定义见 `src/srs/reviewSessionScope.ts`，由 `SrsReviewSessionRenderer` 在加载队列时创建一次并传入 Demo。

| kind | 行为 |
|------|------|
| `all` | 全库动态检查，可追加任意牌组到期卡 |
| `deck` | 可动态检查，但 `selectNewDueCardsForSession` 只保留 `card.deck === deckName` |
| `fixed` | **禁用**每分钟全库扫描与手动全库追加；Again/Hard 短期重学仅允许 scope 内卡重新入队；List 同根后续条目/辅助预览通过 `fixedRootIds` 放行 |

**重要**：

- 初始队列、定时刷新、手动刷新、pending due 重新入队共用同一过滤函数，避免规则分叉。
- Demo **不**导入/调用 `getReviewDeckFilter()`；不依赖可变全局。
- 启动后即使全局 deck filter 被改成其他牌组，当前会话 scope 不变。

```typescript
// 自动 / 手动刷新共用：候选不限额，再扣剩余额度
const candidates = buildReviewQueue(await collectReviewCards(pluginName), null)
const newCards = selectNewDueCardsForSession(
  candidates,
  prevQueue,
  sessionScope,
  sessionBudget // null = fixed 不限额
)
```

## 技术实现

### 范围模块 (`src/srs/reviewSessionScope.ts`)

- `createAllScope` / `createDeckScope` / `createFixedScope` / `createScopeFromDeckFilter`
- `isCardInSessionScope` / `filterCardsBySessionScope`
- `allowsFullLibraryDynamicScan`
- `selectNewDueCardsForSession`（自动+手动；可选 budget）
- `selectPendingDueCardsForRequeue`（短期重学；已接纳身份不重复消耗）
- `prepareNormalSessionQueueInput` / `prepareFixedSessionScope`（Renderer 用纯函数）

### 额度模块 (`src/srs/reviewSessionBudget.ts`)

- `resolveDailyQueueLimits`：校验设置，无效 warn 并回退 30/200
- `countUsedDailyQuotasFromLogs` / `remainingDailyLimitsFromLogs`：从今日日志按 cardKey 去重统计 used，得到跨会话 remaining
- `getLocalTodayBounds`：本地时区今天 00:00 → now
- `createSessionRootCardBudget`：会话已接纳正式根卡集合（limits 为 remaining 时即本会话 budget）
- `acceptFormalRoot` / `filterAndAcceptNewFormalRoots`

### 短期重学 pending（F2-04，`src/srs/pendingDueRequeue.ts`）

Again/Hard 后若 FSRS `due` 落在 **5 分钟窗口**内，卡片进入会话内 pending，到期后追加到**队尾**。

| 规则 | 说明 |
|------|------|
| 触发 | 仅**正式** `again` / `hard`；`fixed/repeat` 纯训练与 List 辅助预览**不**伪造正式 pending |
| 幂等 | 按稳定 `cardKey` upsert 最新 card snapshot + 绝对 `dueTime`；`generation` 单调递增 |
| Timer | 唯一有效 wake 带 `scheduledToken`；due 变早/变晚均重排；旧 token 触发时 stale，不得入队 |
| 去重 | **只检查 `currentIndex + 1` 之后的未处理尾部**；历史副本（index 及之前）**不阻止**重入 |
| 顺序 | 多卡到期：`dueTime` 升序，再用 `cardKey` 稳定 tie-break，追加到队尾 |
| 额度 | 经 `selectPendingDueCardsForRequeue`；已接纳身份重入**不重复消耗**；未接纳新身份仍受额度限制 |
| 失败 | scope/budget 拒绝或提交异常：**保留** pending 并诊断，不静默丢记录；接纳成功或已在尾部才移除 |
| 生命周期 | 明确完成按钮 / 关闭 / 卸载 / 新轮次：`deactivateAndClearPending` + 清 timer。**到达队尾 UI 不清 pending**（最后一张 Again 仍可重入）。**不持久化**（F2-09） |
| 完成摘要 reopen | 完成态下 pending **实际追加 ≥1** 时：`reopenSessionFinalizeIfNeeded` 重置 finalize 缓存并 `setSessionStats(null)`，**不清零** progress；`resumeSessionPersistence` 恢复 autosave。未实际追加不得重置摘要。第二次完成摘要须含此前评分 + 重入评分 |

### 复习会话组件 (SrsReviewSessionDemo.tsx)

- prop：`sessionScope`、`sessionDailyLimits`、`sessionFormalRootCards`（均由 Renderer 启动时冻结）
- 60s 定时器：先判断 `allowsFullLibraryDynamicScan`，再 collect + 共用过滤（含额度）
- 手动检查：fixed 直接提示，不 collect
- pending due（F2-04）：`pendingDueStateRef` + `pendingDueRequeue` 纯逻辑；评分成功且 action token 有效后 `trackPendingDueCard`
- List 动态下一条/辅助预览：`isCardInSessionScope`（fixed 同根允许）；显式 `cardType: "list"`

### Flash Home 组件 (SrsFlashcardHome.tsx)

主页统计刷新与会话 scope 无关，仍按全库统计刷新；启动某牌组复习时由 `startReviewSession(deckName)` 写入临时 filter，由 Renderer 启动瞬间读取并冻结。

## 用户体验

### 复习过程中

1. **无感知更新**: 用户正常复习，系统在后台自动检查新卡片（all/deck）
2. **牌组隔离**: 单牌组会话不会混入其他牌组到期卡
3. **专项训练固定**: 重复复习/困难卡不会从全库“漏”进新卡
4. **失败可见**: 检查失败有通知，不静默吞掉

## 性能考虑

1. **智能检查**: 只追加不在队列中的卡
2. **合理频率**: 复习界面 60 秒检查
3. **fixed 零扫描**: 专项训练不触发 collect
4. **资源清理**: 组件卸载时清理定时器

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/srs/reviewSessionScope.ts` | 会话范围纯逻辑 |
| `src/srs/reviewSessionScope.test.ts` | FC-02 / FC-14 回归测试 |
| `src/srs/pendingDueRequeue.ts` | F2-04 Again/Hard 短期 pending 纯逻辑 |
| `src/srs/pendingDueRequeue.test.ts` | 尾部去重 / token / fake timer 回归 |
| `src/components/SrsReviewSessionRenderer.tsx` | 启动时创建并传递 scope |
| `src/components/SrsReviewSessionDemo.tsx` | 动态队列与 pending due |
| `模块文档/SRS_复习队列管理.md` | 队列构建与 scope 总述 |
