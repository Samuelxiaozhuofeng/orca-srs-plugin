# 实现计划

- [x] 1. 创建 Flash Home 块管理模块





  - [x] 1.1 创建 `src/srs/flashcardHomeManager.ts` 文件


    - 实现 `getOrCreateFlashcardHomeBlock(pluginName)` 函数
    - 实现 `cleanupFlashcardHomeBlock(pluginName)` 函数
    - 使用 `orca.plugins.getData/setData` 存储块 ID
    - _需求: 5.2_
  - [ ]* 1.2 编写属性测试：块复用一致性
    - **Property 3: 块复用一致性**
    - **验证: 需求 5.2**

- [-] 2. 创建统计计算工具函数



  - [x] 2.1 在 `src/srs/deckUtils.ts` 中添加 `calculateHomeStats` 函数



    - 计算 todayCount（今天到期的复习卡片，不含新卡）
    - 计算 newCount（新卡数量）
    - 计算 pendingCount（所有待复习卡片）
    - 计算 totalCount（总卡片数）
    - _需求: 1.1, 1.2, 1.3_
  - [ ]* 2.2 编写属性测试：统计数据一致性
    - **Property 1: 统计数据一致性**
    - **验证: 需求 1.1, 1.2, 1.3**
  - [ ]* 2.3 编写属性测试：牌组统计完整性
    - **Property 5: 牌组统计完整性**
    - **验证: 需求 3.2**


- [x] 3. 创建筛选工具函数




  - [x] 3.1 在 `src/srs/cardFilterUtils.ts` 中创建筛选函数


    - 实现 `filterCards(cards, filter)` 函数
    - 支持 all/overdue/today/future/new 五种筛选类型
    - _需求: 4.2, 4.3_
  - [ ]* 3.2 编写属性测试：筛选结果正确性
    - **Property 2: 筛选结果正确性**
    - **验证: 需求 4.3**


- [x] 4. Checkpoint - 确保所有测试通过




  - 确保所有测试通过，如有问题请询问用户。

- [x] 5. 创建 Flash Home 主组件





  - [x] 5.1 创建 `src/components/SrsFlashcardHome.tsx` 主组件


    - 实现 DeckListView（牌组列表视图）
    - 实现 CardListView（卡片列表视图）
    - 使用 SafeBlockPreview 渲染牌组和卡片块
    - 确保 Hooks 调用顺序一致，避免 Error #185
    - _需求: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1_
  - [x] 5.2 实现事件订阅和静默刷新


    - 订阅 srsEvents 的 CARD_GRADED/CARD_POSTPONED/CARD_SUSPENDED 事件
    - 收到事件后静默刷新数据，保持视图状态不变
    - _需求: 6.1, 6.2, 6.3_
  - [ ]* 5.3 编写属性测试：视图状态保持
    - **Property 4: 视图状态保持**
    - **验证: 需求 6.3**


- [x] 6. 创建 Flash Home 块渲染器




  - [x] 6.1 创建 `src/components/SrsFlashcardHomeRenderer.tsx`


    - 使用 BlockShell 包裹
    - 使用 SrsErrorBoundary 捕获错误
    - 加载数据并传递给 SrsFlashcardHome
    - _需求: 7.2, 7.3, 7.4_
  - [x] 6.2 在 `src/srs/registry/renderers.ts` 中注册渲染器


    - 注册 `srs.flashcard-home` 块类型
    - _需求: 3.1, 4.1_

- [x] 7. 注册命令和 UI 入口





  - [x] 7.1 在 `src/srs/registry/commands.ts` 中添加 `openFlashcardHome` 命令


    - 调用 flashcardHomeManager 获取块 ID
    - 在当前面板右侧打开 Flash Home
    - _需求: 5.1_
  - [x] 7.2 在 `src/srs/registry/uiComponents.tsx` 中添加顶部栏按钮


    - 添加 Flash Home 按钮（图标：ti-home）
    - 点击执行 openFlashcardHome 命令
    - _需求: 5.3_


- [x] 8. 在 main.ts 中导出 openFlashcardHome 函数




  - 实现面板打开逻辑
  - 支持复用右侧面板
  - _需求: 5.1, 2.1, 2.2_

- [x] 9. 添加转换器支持





  - [x] 9.1 在 `src/srs/registry/converters.ts` 中添加 plain 转换器


    - 输出 `[SRS Flashcard Home 面板块]`
    - _需求: 3.1_


- [x] 10. Final Checkpoint - 确保所有测试通过




  - 确保所有测试通过，如有问题请询问用户。

