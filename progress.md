# Orca SRS 插件 - 开发进度

## 📋 项目信息

- **项目名称**: Orca SRS 插件 (虎鲸标记 内置闪卡)
- **技术栈**: TypeScript + React 18 + Vite + FSRS 算法
- **当前版本**: v0.9 (Deck 分组已迁移至标签属性系统)
- **最后更新**: 2025-12-07

---

## ✅ 已完成核心功能

### 1. FSRS 算法集成
- ✅ 使用官方 ts-fsrs 库实现间隔重复算法
- ✅ 完整的 SRS 状态管理（稳定度、难度、间隔、到期时间等）
- ✅ 支持 4 级评分（Again / Hard / Good / Easy）
- 📁 文件：[`src/srs/algorithm.ts`](src/srs/algorithm.ts)、[`src/srs/storage.ts`](src/srs/storage.ts)、[`src/srs/types.ts`](src/srs/types.ts)

### 2. 卡片创建与管理
- ✅ 标签自动识别：打 `#card` 标签自动转换为卡片
- ✅ 手动转换：通过命令/斜杠命令转换当前块
- ✅ **Deck 分组**：通过 Orca 标签属性系统设置 deck（已完成迁移）
  - 用户在标签页面为 `#card` 定义 "deck" 属性（多选文本）
  - 从 `block.refs[].data` 读取 deck 值
  - 支持数组和字符串两种格式（兼容单选/多选）
- ✅ 智能跳过：避免重复转换已有卡片
- 📁 文件：[`src/main.ts`](src/main.ts:454-504)（`extractDeckName` 函数）

### 3. 复习系统
- ✅ 真实队列：自动筛选到期卡片和新卡
- ✅ 智能排序：2 旧卡 + 1 新卡交织
- ✅ 实时评分：评分后立即更新 FSRS 状态
- ✅ 进度显示：顶部进度条 + 统计信息
- 📁 文件：[`src/components/SrsReviewSessionDemo.tsx`](src/components/SrsReviewSessionDemo.tsx)

### 4. 卡片浏览器
- ✅ 两级导航：Deck 列表 → 卡片列表
- ✅ 状态筛选：全部、已到期、今天到期、未来、新卡
- ✅ 统计信息：每个 deck 的卡片数量和到期情况
- ✅ 快速跳转：点击卡片跳转到对应块
- ✅ 复习入口：支持复习所有 deck 或单个 deck
- 📁 文件：[`src/components/SrsCardBrowser.tsx`](src/components/SrsCardBrowser.tsx)

### 5. 自定义块渲染器
- ✅ 卡片样式：在编辑器中以特殊样式显示
- ✅ 交互功能：显示答案 + 评分按钮
- ✅ 状态显示：底部展示当前 SRS 状态
- 📁 文件：[`src/components/SrsCardBlockRenderer.tsx`](src/components/SrsCardBlockRenderer.tsx)

### 6. UI 组件
- ✅ 工具栏按钮：开始复习、打开浏览器
- ✅ 斜杠命令：`/srs-review`、`/srs-browser`、`/srs-card`、`/srs-scan`
- ✅ 命令面板：所有功能均可通过命令面板访问
- ✅ 主题适配：自动适配 Orca 浅色/深色主题

---

## 📁 项目结构

```
src/
├── main.ts                          # 插件入口（命令注册、渲染器注册）
├── components/
│   ├── SrsCardDemo.tsx              # 单卡组件（题目/答案/评分）
│   ├── SrsReviewSessionDemo.tsx     # 复习会话（队列管理）
│   ├── SrsCardBlockRenderer.tsx     # 块渲染器（编辑器内显示）
│   └── SrsCardBrowser.tsx           # 卡片浏览器（Deck 管理）
├── srs/
│   ├── algorithm.ts                 # FSRS 算法封装
│   ├── storage.ts                   # 数据存储（读写块属性）
│   └── types.ts                     # 类型定义
└── libs/
    └── l10n.ts                      # 国际化工具
```

---

## 🚀 快速开始

### 构建插件
```bash
npm install
npm run build
```

### 部署到 Orca
1. 将项目文件夹复制到 `~/Documents/orca/plugins/`
2. 在 Orca 设置中启用插件
3. 重启 Orca

### 使用方式

#### 创建卡片
1. **方式 1：标签自动识别**
   ```
   什么是闭包？ #card
     - 闭包是指函数能够访问其词法作用域外的变量
   ```
   - 运行命令：`SRS: 扫描带标签的卡片`

2. **方式 2：手动转换**
   - 创建块结构（父块=题目，子块=答案）
   - 运行命令：`SRS: 将块转换为记忆卡片`
   - 或使用斜杠命令：`/srs-card`

#### 设置 Deck 分组
1. 在 Orca 标签页面为 `#card` 标签添加属性 "deck"（类型：多选文本）
2. 添加可选值（如 "English"、"物理"、"数学"）
3. 给块打 `#card` 标签后，从下拉菜单选择 deck 值
4. 如果不选择，默认归入 "Default" deck

#### 开始复习
- 点击工具栏卡片图标
- 或运行命令：`SRS: 开始复习`
- 或使用斜杠命令：`/srs-review`

#### 浏览卡片
- 点击工具栏列表图标
- 或运行命令：`SRS: 打开卡片浏览器`
- 或使用斜杠命令：`/srs-browser`

---

## 🔧 当前问题与限制

### 已知问题
1. **缺少配额限制**
   - 未设置每日新卡/旧卡上限
   - 长队列可能一次性全部进入会话

2. **统计功能简单**
   - 仅在通知/日志中提示
   - 缺少历史记录和统计面板

### 功能限制
- 不支持 deck/标签筛选与排序
- 不支持批量操作（删除、移动、重置）
- 不支持导入导出（Anki 格式）
- 不支持学习进度可视化

---

## 📋 开发计划

### ✅ 已完成：Deck 分组迁移（2025-12-07）
- ✅ 迁移到 Orca 标签属性系统
- ✅ 重写 [`extractDeckName()`](src/main.ts:454) 函数
- ✅ 删除旧格式相关代码（`#card/xxx`）
- ✅ 处理多选属性值为数组的兼容性问题
- 📄 详细计划：[`improvement_plan.md`](improvement_plan.md)

**成功经验**：
- 通过详细日志快速定位 Orca 多选属性值存储为数组的问题
- 实现了对数组和字符串两种格式的兼容处理
- 完善的边界情况检查确保了稳定性



## 📚 参考文档

### 项目文档
- [`CLAUDE.md`](CLAUDE.md) - 开发指南和架构说明
- [`improvement_plan.md`](improvement_plan.md) - Deck 分组迁移计划
- [`README.md`](README.md) - 项目说明

### Orca API 文档
- [`src/orca.d.ts`](src/orca.d.ts) - 完整 API 类型定义（5000+ 行）
- [`plugin-docs/`](plugin-docs/) - 官方文档
  - [`Quick-Start.md`](plugin-docs/documents/Quick-Start.md)
  - [`Backend-API.md`](plugin-docs/documents/Backend-API.md)
  - [`Core-Commands.md`](plugin-docs/documents/Core-Commands.md)
  - [`Custom-Renderers.md`](plugin-docs/documents/Custom-Renderers.md)

### 外部资源
- [Orca 插件模板](https://github.com/sethyuan/orca-plugin-template)
- [Tabler Icons](https://tabler-icons.io/)
- [FSRS 算法](https://github.com/open-spaced-repetition/ts-fsrs)

---

## 🤝 贡献指南

### 开发流程
1. 选择任务（从开发计划中）
2. 创建功能分支
3. 开发并测试
4. 提交代码（遵循代码规范）
5. 更新本文档

### 代码规范
- 使用 TypeScript 静态类型
- 添加详细的中文注释
- 遵循现有命名规范
- 测试后再提交

### 提交前检查
- [ ] `npm run build` 无错误
- [ ] 所有函数有类型定义
- [ ] 关键逻辑有注释
- [ ] 在 Orca 中测试通过
- [ ] 更新 `progress.md`

---

**最后更新**: 2025-12-07
**当前状态**: Deck 分组迁移已完成，下一步优化配额限制和统计功能
