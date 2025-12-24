# 需求文档

## 简介

Flash Home（闪卡主页）是 SRS 插件的卡片浏览器和仪表板功能。它以块渲染器的形式嵌入 Orca 面板系统，提供统计概览、Deck 管理和卡片列表浏览功能，替代早期的模态弹窗方案。

## 术语表

- **Flash_Home**：闪卡主页组件，作为块渲染器嵌入 Orca 面板
- **Deck**：牌组，卡片的分组单位
- **ReviewCard**：复习卡片数据结构，包含 SRS 状态信息
- **DeckStats**：牌组统计信息，包含各 Deck 的卡片数量和到期情况
- **TodayStats**：今日统计信息，包含待复习数、新卡数等
- **BlockRenderer**：Orca 块渲染器，用于自定义块的显示方式

## 需求

### 需求 1

**用户故事：** 作为用户，我想要查看所有牌组的统计概览，以便了解今天的复习任务量。

#### 验收标准

1. WHEN 用户打开 Flash_Home THEN Flash_Home SHALL 显示今日待复习卡片数量（不含新卡）
2. WHEN 用户打开 Flash_Home THEN Flash_Home SHALL 显示新卡待学数量
3. WHEN 用户打开 Flash_Home THEN Flash_Home SHALL 显示总卡片数量
4. WHEN 用户点击刷新按钮 THEN Flash_Home SHALL 重新计算并更新所有统计数据

### 需求 2

**用户故事：** 作为用户，我想要快速开始复习会话，以便高效完成今日复习任务。

#### 验收标准

1. WHEN 用户点击"开始今日复习"按钮 THEN Flash_Home SHALL 启动包含所有到期卡片的复习会话
2. WHILE 没有待复习卡片 THEN Flash_Home SHALL 禁用复习按钮并显示视觉提示
3. WHEN 复习会话完成后返回 Flash_Home THEN Flash_Home SHALL 自动刷新统计数据

### 需求 3

**用户故事：** 作为用户，我想要查看所有牌组列表，以便管理和选择特定牌组进行复习。

#### 验收标准

1. WHEN 用户打开 Flash_Home THEN Flash_Home SHALL 使用 Orca 原生 Block 渲染器显示牌组列表
2. WHEN 显示牌组块 THEN Flash_Home SHALL 在块内展示牌组名称、待复习数、新卡数和总卡片数
3. WHEN 用户点击牌组块 THEN Flash_Home SHALL 切换到该牌组的卡片列表视图
4. WHEN 用户点击牌组块的"复习"按钮 THEN Flash_Home SHALL 启动仅包含该牌组卡片的复习会话
5. WHEN 渲染牌组块 THEN Flash_Home SHALL 使用 BlockPreview 组件以保持原生编辑器风格

### 需求 4

**用户故事：** 作为用户，我想要浏览特定牌组的卡片列表，以便查看和管理单个卡片。

#### 验收标准

1. WHEN 用户进入卡片列表视图 THEN Flash_Home SHALL 使用 Orca 原生 Block 渲染器显示该牌组的所有卡片
2. WHEN 显示卡片列表 THEN Flash_Home SHALL 提供筛选标签（全部、已到期、今天、未来、新卡）
3. WHEN 用户点击筛选标签 THEN Flash_Home SHALL 按选中条件过滤卡片列表
4. WHEN 用户点击卡片块 THEN Flash_Home SHALL 在右侧面板打开该卡片的原始块
5. WHEN 用户点击返回按钮 THEN Flash_Home SHALL 返回牌组列表视图
6. WHEN 渲染卡片块 THEN Flash_Home SHALL 使用 BlockPreview 组件展示卡片内容预览

### 需求 5

**用户故事：** 作为用户，我想要通过命令面板或工具栏快速打开 Flash_Home，以便随时访问卡片管理功能。

#### 验收标准

1. WHEN 用户执行 openFlashcardHome 命令 THEN Flash_Home SHALL 在当前面板右侧打开
2. IF Flash_Home 块已存在 THEN Flash_Home SHALL 复用现有块而非创建新块
3. WHEN 用户点击顶部栏的 Flash_Home 按钮 THEN Flash_Home SHALL 执行 openFlashcardHome 命令

### 需求 6

**用户故事：** 作为用户，我想要在复习完成后看到实时更新的统计数据，以便了解复习进度。

#### 验收标准

1. WHEN 复习面板中评分、埋藏或暂停卡片成功 THEN Flash_Home SHALL 通过事件订阅接收通知
2. WHEN Flash_Home 接收到卡片状态变更事件 THEN Flash_Home SHALL 静默刷新统计数据
3. WHEN 刷新数据时 THEN Flash_Home SHALL 保持当前视图状态不变

### 需求 7

**用户故事：** 作为开发者，我想要组件具有良好的错误处理和稳定性，以便用户获得流畅的使用体验。

#### 验收标准

1. WHEN Flash_Home 组件渲染时 THEN Flash_Home SHALL 确保 React Hooks 调用顺序一致以避免 Error #185
2. WHEN 组件内部发生错误 THEN Flash_Home SHALL 使用 ErrorBoundary 捕获并显示友好的错误提示
3. WHEN 异步数据加载失败 THEN Flash_Home SHALL 显示错误状态并提供重试按钮
4. IF BlockPreview 组件渲染失败 THEN Flash_Home SHALL 回退到简单文本显示

