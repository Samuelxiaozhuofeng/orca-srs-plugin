SRS 复习界面重构记录（2025-12-08版）
====================================

目标
----
- 复习面板直接嵌入可编辑 Block，去掉 textarea/手动保存逻辑。
- 题目区域只显示 `#card` 父块，答案在点击“显示答案”后再出现。
- 复习面板编辑时要写回原面板的块（依赖 Orca 的自动保存）。

最终实现
--------
1. **SrsReviewSessionRenderer.tsx**
   - 在加载队列时同步导入 `getReviewHostPanelId()`。
   - 将 host panel ID（若不存在则回退当前 panelId）存到 `cardPanelId` 并传给 `SrsReviewSessionDemo`。
   - 目的：复习面板里的 `<orca.components.Block>` 使用原面板上下文，才能正常编辑和同步。

2. **SrsReviewSessionDemo.tsx**
   - Props 新增 `panelId?: string`，并在侧面板/模态两种挂载方式中都把该值传给 `SrsCardDemo`。
   - 其余逻辑（评分、进度、跳转）保持不变。

3. **SrsCardDemo.tsx**
   - 新增 `ReviewBlock` 组件，封装 `<orca.components.Block>`：
     * 根据 `blockId+panelId` 渲染真实块，否则回退到纯文本。
     * 提供 `hideChildren` 选项：当为题目块渲染时，使用 `renderingMode="simple"` 并在渲染后用 `MutationObserver` 隐藏所有子块 DOM，避免答案提前泄露。
   - 题目区域调用 `renderBlock(blockId, front, { hideChildren: true })`。
   - 答案区域在 `showAnswer` 为 `true` 时获取 `answerBlockId = blocks[blockId]?.children?.[0]` 后渲染 `renderBlock(answerBlockId, back)`。
   - 继续保留 `showAnswer` 状态、评分按钮、跳转按钮、回退文本等逻辑。
   - 删除所有 textarea/保存状态/自定义保存函数，完全依赖 Block 的自动保存。

关键行为验证
-----------
1. **题目显示**：只渲染父块本身；由于 `hideChildren`，其子块不会出现在正面区域。
2. **答案显示**：点击“显示答案”后渲染首个子块（若不存在则显示 `back` 文本）。
3. **编辑**：在复习面板中直接修改题目或答案，Orca 会在原 panel ID 上自动保存。
4. **边界**：当 `panelId` 或 `blockId` 缺失时，仍旧使用字符串 `front/back` 做降级展示。

测试建议
-------
1. 复习面板中编辑题目/答案，切回原面板确认同步生效。
2. 验证题目区不会显示子块；点击“显示答案”才出现答案块。
3. 测试无子块/旧卡片（缺 blockId）的兼容情况。
4. 评分、跳转、复习完成流程保持原行为。
