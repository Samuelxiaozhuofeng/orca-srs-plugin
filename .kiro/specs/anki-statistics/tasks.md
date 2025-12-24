# 实现计划

- [x] 1. 创建数据类型和存储模块





  - [x] 1.1 创建统计相关的类型定义


    - 在 `src/srs/types.ts` 中添加 ReviewLogEntry, TodayStatistics, FutureForecast 等类型
    - 添加 TimeRange, CardState 等辅助类型
    - _Requirements: 11.1, 11.2_
  - [x] 1.2 创建复习记录存储模块


    - 创建 `src/srs/reviewLogStorage.ts`
    - 实现按月分片存储逻辑
    - 实现 saveReviewLog, getReviewLogs, cleanupOldLogs 函数
    - _Requirements: 11.1, 11.2, 11.4_
  - [x] 1.3 编写属性测试：复习记录往返一致性


    - **Property 12: 复习记录往返一致性**
    - **Validates: Requirements 11.2, 11.3**
  - [x] 1.4 编写属性测试：旧记录清理正确性

    - **Property 13: 旧记录清理正确性**
    - **Validates: Requirements 11.4**

- [x] 2. 实现统计计算核心逻辑





  - [x] 2.1 创建统计管理器模块


    - 创建 `src/srs/statisticsManager.ts`
    - 实现 getTodayStatistics 函数
    - 实现 getFutureForecast 函数
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_
  - [x] 2.2 编写属性测试：今日统计计算正确性


    - **Property 1: 今日统计计算正确性**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [x] 2.3 编写属性测试：未来预测累计一致性

    - **Property 2: 未来预测累计一致性**
    - **Validates: Requirements 2.1, 2.3**
  - [x] 2.4 实现复习历史统计


    - 实现 getReviewHistory 函数
    - 支持按时间范围过滤
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.5 编写属性测试：复习历史评分总和一致性


    - **Property 3: 复习历史评分总和一致性**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 2.6 实现卡片状态分布统计


    - 实现 getCardStateDistribution 函数
    - _Requirements: 4.1, 4.3_
  - [x] 2.7 编写属性测试：卡片状态分布总和一致性


    - **Property 5: 卡片状态分布总和一致性**
    - **Validates: Requirements 4.1, 4.3**

- [x] 3. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现更多统计计算功能





  - [x] 4.1 实现复习时间统计


    - 实现 getReviewTimeStats 函数
    - 计算每日复习时间、平均时间、总时间
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 4.2 编写属性测试：复习时间平均值正确性


    - **Property 6: 复习时间平均值正确性**
    - **Validates: Requirements 5.2, 5.3**
  - [x] 4.3 实现卡片间隔分布统计

    - 实现 getIntervalDistribution 函数
    - 使用对数刻度分组
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.4 编写属性测试：间隔分布分组完整性
    - **Property 7: 间隔分布分组完整性**
    - **Validates: Requirements 6.1, 6.2**
  - [x] 4.5 编写属性测试：间隔平均值正确性

    - **Property 8: 间隔平均值正确性**
    - **Validates: Requirements 6.3**
  - [x] 4.6 实现答题按钮统计

    - 实现 getAnswerButtonStats 函数
    - 计算正确率
    - _Requirements: 7.1, 7.4_

  - [x] 4.7 编写属性测试：答题按钮正确率计算
    - **Property 9: 答题按钮正确率计算**
    - **Validates: Requirements 7.1, 7.4**
  - [x] 4.8 实现卡片难度分布统计

    - 实现 getDifficultyDistribution 函数
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 4.9 编写属性测试：难度分布统计正确性

    - **Property 11: 难度分布统计正确性**
    - **Validates: Requirements 10.1, 10.2, 10.3**


- [x] 5. 实现时间范围和牌组过滤





  - [x] 5.1 实现时间范围过滤逻辑

    - 添加 TimeRange 类型和 getTimeRangeStartDate 函数
    - 在所有统计函数中支持时间范围参数
    - _Requirements: 8.1, 8.2, 8.4_
  - [x] 5.2 编写属性测试：时间范围过滤正确性


    - **Property 4: 时间范围过滤正确性**
    - **Validates: Requirements 3.3, 5.4, 7.3, 8.2**
  - [x] 5.3 实现牌组过滤逻辑


    - 在所有统计函数中支持牌组筛选参数
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 5.4 编写属性测试：牌组过滤正确性

    - **Property 10: 牌组过滤正确性**
    - **Validates: Requirements 9.2, 9.3, 9.4**
  - [x] 5.5 实现用户偏好存储


    - 存储用户选择的时间范围偏好
    - _Requirements: 8.3_

- [x] 6. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. 创建图表组件





  - [x] 7.1 创建基础柱状图组件

    - 创建 `src/components/charts/BarChart.tsx`
    - 使用 SVG 实现轻量级图表
    - 支持悬停显示详情
    - _Requirements: 2.1, 3.1, 5.1, 6.1_

  - [x] 7.2 创建堆叠柱状图组件

    - 创建 `src/components/charts/StackedBarChart.tsx`
    - 支持多色堆叠显示
    - _Requirements: 3.2_

  - [x] 7.3 创建饼图/环形图组件

    - 创建 `src/components/charts/PieChart.tsx`
    - 支持点击交互
    - _Requirements: 4.2, 7.2_


  - [x] 7.4 创建趋势线组件

    - 创建 `src/components/charts/LineChart.tsx`
    - 用于显示累计趋势
    - _Requirements: 2.3_


- [x] 8. 创建统计视图组件


  - [x] 8.1 创建统计视图主组件


    - 创建 `src/components/StatisticsView.tsx`
    - 实现整体布局和导航
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 8.2 创建今日统计卡片组件

    - 显示今日复习概览
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 8.3 创建未来预测图表组件

    - 集成柱状图和趋势线

    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 8.4 创建复习历史图表组件
    - 集成堆叠柱状图
    - _Requirements: 3.1, 3.2, 3.3, 3.4_


  - [x] 8.5 创建卡片状态分布组件
    - 集成饼图
    - _Requirements: 4.1, 4.2, 4.3, 4.4_


  - [x] 8.6 创建时间范围选择器组件

    - 支持 1个月/3个月/1年/全部 选项
    - _Requirements: 8.1, 8.2_
  - [x] 8.7 创建牌组筛选器组件

    - 支持选择特定牌组或全部
    - _Requirements: 9.1, 9.2, 9.3_


- [x] 9. 集成到 Flash Home





  - [x] 9.1 在 Flash Home 添加统计入口按钮

    - 修改 `src/components/SrsFlashcardHome.tsx`
    - 添加统计按钮到顶部工具栏
    - _Requirements: 12.1_

  - [x] 9.2 实现视图切换逻辑

    - 支持牌组列表和统计视图之间切换
    - 添加过渡动画
    - _Requirements: 12.2, 12.3, 12.4_

  - [x] 9.3 集成复习记录收集

    - 修改复习会话管理器，在复习完成时记录日志
    - _Requirements: 11.1_

- [x] 10. 添加样式和优化





  - [x] 10.1 添加统计视图样式


    - 在 `src/styles/srs-review.css` 中添加统计相关样式
    - 确保与现有主题一致
  - [x] 10.2 添加图表动画效果


    - 添加图表加载动画
    - 添加数据更新过渡效果
  - [x] 10.3 性能优化


    - 实现数据缓存
    - 优化大数据集的计算性能

- [ ] 11. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

