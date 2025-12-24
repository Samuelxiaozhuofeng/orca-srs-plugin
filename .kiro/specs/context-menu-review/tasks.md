# 实现计划

- [x] 1. 创建块卡片收集模块





  - [x] 1.1 创建 `blockCardCollector.ts` 文件，实现块类型判断函数


    - 实现 `isQueryBlock(block)` 判断块是否为查询块
    - 实现 `getQueryResults(blockId)` 获取查询块的结果列表
    - _Requirements: 1.1, 4.1_
  - [x] 1.2 实现递归子块遍历函数

    - 实现 `getAllDescendantIds(blockId)` 递归获取所有子块 ID
    - 支持任意深度的块树结构
    - _Requirements: 2.2_
  - [x] 1.3 编写属性测试：子块递归遍历完整性


    - **Property 2: 子块递归遍历完整性**
    - **Validates: Requirements 2.2, 2.3**
  - [x] 1.4 实现查询块卡片收集函数


    - 实现 `collectCardsFromQueryBlock(blockId, pluginName)`
    - 从查询结果中筛选带 #Card 标签的块
    - 复用现有 `cardCollector.ts` 中的卡片转换逻辑
    - _Requirements: 1.2, 1.3_
  - [x] 1.5 编写属性测试：查询块卡片收集完整性


    - **Property 1: 查询块卡片收集完整性**
    - **Validates: Requirements 1.2**
  - [x] 1.6 实现子块卡片收集函数


    - 实现 `collectCardsFromChildren(blockId, pluginName)`
    - 递归遍历子块并收集带 #Card 标签的块
    - _Requirements: 2.3, 2.4_
  - [x] 1.7 编写属性测试：卡片转换一致性


    - **Property 3: 卡片转换一致性**
    - **Validates: Requirements 1.3, 2.4**


- [x] 2. Checkpoint - 确保所有测试通过




  - 确保所有测试通过，如有问题请询问用户。


- [x] 3. 实现重复复习会话管理




  - [x] 3.1 创建 `repeatReviewManager.ts` 文件


    - 定义 `RepeatReviewSession` 接口
    - 实现 `createRepeatReviewSession()` 创建会话
    - 实现 `resetCurrentRound()` 重置当前轮次
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 编写属性测试：重复复习队列重置


    - **Property 4: 重复复习队列重置**
    - **Validates: Requirements 3.2**
  - [x] 3.3 扩展复习会话渲染器支持重复模式


    - 修改 `SrsReviewSessionDemo.tsx` 添加重复模式支持
    - 添加"重复复习"标识显示
    - 添加"再复习一轮"按钮
    - _Requirements: 3.3, 3.5_


- [x] 4. 注册右键菜单




  - [x] 4.1 创建 `contextMenuRegistry.ts` 文件


    - 实现右键菜单注册函数
    - 实现右键菜单注销函数
    - _Requirements: 1.1, 2.1_
  - [x] 4.2 实现查询块右键菜单项


    - 菜单项标签："复习此查询结果"
    - 条件：块为查询块
    - 动作：收集卡片并启动重复复习会话
    - _Requirements: 1.1, 1.2, 1.3, 4.1_
  - [x] 4.3 实现普通块右键菜单项


    - 菜单项标签："复习子块卡片"
    - 条件：块为普通块
    - 动作：收集子块卡片并启动重复复习会话
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.2_
  - [x] 4.4 实现菜单项卡片数量预估显示


    - 在菜单项旁显示预估卡片数量
    - 数量为零时禁用菜单项
    - _Requirements: 4.3, 4.4_


- [x] 5. 集成到主入口




  - [x] 5.1 在 `main.ts` 中注册右键菜单


    - 在 `load()` 函数中调用 `registerContextMenu()`
    - 在 `unload()` 函数中调用 `unregisterContextMenu()`
    - _Requirements: 1.1, 2.1_

  - [x] 5.2 导出启动重复复习会话函数

    - 实现 `startRepeatReviewSession()` 函数
    - 支持从查询块或子块启动
    - _Requirements: 3.1_

- [x] 6. 处理边界情况和错误






  - [x] 6.1 实现空结果处理

    - 查询结果为空时显示提示
    - 子块中无卡片时显示提示
    - _Requirements: 1.4, 2.5_

  - [x] 6.2 实现错误处理

    - 块不存在时显示错误
    - 卡片加载失败时提供重试选项


- [x] 7. Checkpoint - 确保所有测试通过




  - 确保所有测试通过，如有问题请询问用户。
