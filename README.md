# 🐋 虎鲸标记 - Orca Notes 内置闪卡插件

> 一款为 [虎鲸笔记 (Orca Notes)](https://orca.do) 打造的间隔重复记忆系统（SRS）插件，帮助你在笔记中高效制作和复习闪卡。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Orca Notes](https://img.shields.io/badge/Orca%20Notes-Plugin-purple.svg)](https://orca.do)

---

## ✨ 功能特性

### 📝 主要卡片类型

| 类型                 | 说明                       | 适用场景           |
| -------------------- | -------------------------- | ------------------ |
| **Basic 基础卡**     | 父块为题目，子块为答案     | 问答式知识点       |
| **Cloze 填空卡**     | 挖空文本中的关键词         | 定义、概念记忆     |
| **Direction 方向卡** | 双向问答（正向/反向/双向） | 词汇对应、因果关系 |

### 📖 渐进阅读

- 支持 Topic（渐进阅读主题）与 Extract（摘录）两类块
- 独立的阅读面板与队列调度（不影响 SRS 复习；打开面板只展示，不会自动改排期）
- 支持标记已读、调整优先级（0-100）、生成卡片与删除操作

### 🧠 FSRS 记忆算法

采用先进的 **FSRS（Free Spaced Repetition Scheduler）** 算法：

- 科学的遗忘曲线模型
- 四级评分：Again / Hard / Good / Easy
- 动态调整复习间隔和难度
- 与 Anki 算法高度兼容

### AI 生成闪卡

- 支持 OpenAI / DeepSeek / Ollama 等 **OpenAI 兼容** Chat Completions 端点
- 从当前块源文本一次生成 Basic 或 Cloze 草稿，本地校验后再预览编辑保存
- 设置仅需 API Key、API URL、模型名称

### 🎯 沉浸式复习体验

- 全屏复习界面
- 流畅的卡片切换动画
- 支持键盘快捷键（与 Anki 一致）
- Bury（埋藏）和 Suspend（暂停）功能

### 📝 卡组备注管理

- 为每个卡组添加个性化备注
- 支持多行文本和特殊字符
- 在卡组列表中直接编辑备注
- 记录学习计划、进度和心得

### 🔍 智能搜索功能

- 实时搜索卡组名称和备注内容
- 搜索结果高亮显示匹配关键词
- 支持 Escape 键快速清空搜索
- 动态显示搜索结果统计信息

---

## 📦 安装

### 方法一：从发布版本安装（推荐）

1. 前往 [Releases](https://github.com/Samuelxiaozhuofeng/orca-srs-plugin/releases) 下载 `orca-srs-<version>.zip`
2. 解压后得到顶层文件夹 **`orca-srs/`**（内含 `icon.png`、`dist/index.js`、`dist/style.css`、`THIRD_PARTY_NOTICES.md` 等）
3. 将整个 **`orca-srs`** 文件夹放入虎鲸笔记的 `plugins` 目录（文件夹名即插件 id）
4. 在虎鲸笔记中启用插件

> 不要只拷贝内部的 `dist/` 一层；Orca 需要插件根目录下同时有 `icon.png` 与 `dist/index.js`。

### 方法二：从源码构建

**环境要求：** Node.js **20.19+**（与 `package.json` `engines` / CI 一致）

```bash
git clone https://github.com/Samuelxiaozhuofeng/orca-srs-plugin.git
cd orca-srs-plugin
npm ci
npm run build
npm run test:release     # 发布脚本与门禁回归测试
# 生成可安装布局（不触碰本机 Orca 目录）
npm run release:stage
npm run release:verify   # 默认要求 readiness Go；当前 No-Go 会失败（属预期）
# 结构自检（不代表可发布）：npm run release:verify -- --allow-incomplete-readiness
npm run release:ready    # 还要求 dist 证据哈希、干净工作树和 v<version> tag
npm run release:zip      # 调用严格 ready 门禁；No-Go 时拒绝生成正式 zip
```

> **版本确认 ≠ 发布 Go。** 当前元数据版本为 `1.0.2`，但 `release-evidence/release-readiness.json` 在 Orca 真机与证据门禁完成前为 No-Go；正式 `orca-srs-1.0.2.zip` 必须绑定已验收 `dist/index.js` 的 SHA-256、干净提交和指向该提交的 `v1.0.2` tag。推送 tag 后由 tag-only workflow 复验并发布。

`npm run build` **仅**在仓库内生成 `dist/`，不会复制或删除工作区外路径。

本机热部署（可选，目标路径必须显式提供）：

```bash
ORCA_PLUGIN_ROOT=/absolute/path/to/orca/plugins/orca-srs npm run deploy:local
# 或
npm run deploy:local -- --target=/absolute/path/to/orca/plugins/orca-srs
```

`deploy:local` 采用临时目录校验后再替换，避免先删除再用的半安装状态。

> **语言：** 当前界面文案以**中文**为主；完整多语言尚未提供（`src/translations/zhCN.ts` 仅为脚手架）。

---

## 🚀 快速开始

### 创建 Basic 基础卡

1. 在块中输入题目内容
2. 创建子块输入答案
3. 输入 `/转换为记忆卡片` 或使用命令面板

```
这是题目 #card
  └── 这是答案
```

### 创建 Cloze 填空卡

1. 输入包含知识点的文本
2. 选中要挖空的关键词
3. 点击工具栏的 `{ }` 按钮

```
中国的首都是北京
         ↓ 选中"北京"后点击 Cloze 按钮
中国的首都是[北京] #card
```

### 创建 Direction 方向卡

1. 在块中输入"问题 答案"格式的内容
2. 将光标放在问题和答案之间
3. 按 `Ctrl+Alt+.`（正向）或 `Ctrl+Alt+,`（反向）

```
中国首都北京
    ↓ 光标放在"都"和"北"之间，按 Ctrl+Alt+.
中国首都 → 北京 #card
```

### 使用 AI 生成闪卡

1. 光标放在有文本的块上
2. 输入 `/AI 生成闪卡`（或命令面板「SRS: AI 生成闪卡」）
3. 选择 Basic / Cloze 与最多张数，生成草稿
4. 预览中编辑、勾选后确认保存（关闭弹窗不写笔记）

```
光合作用是植物利用阳光将二氧化碳和水转化为葡萄糖的过程
  └── （确认后）问题块 #card
      └── 答案块
```

---

## ⌨️ 快捷键

### 复习界面

| 按键   | 操作     | 说明                 |
| ------ | -------- | -------------------- |
| `空格` | 显示答案 | 仅在答案未显示时有效 |
| `1`    | Again    | 忘记                 |
| `2`    | Hard     | 困难                 |
| `3`    | Good     | 良好                 |
| `4`    | Easy     | 简单                 |
| `b`    | Bury     | 埋藏到明天           |
| `s`    | Suspend  | 暂停卡片             |

### 编辑器

| 快捷键       | 操作             |
| ------------ | ---------------- |
| `Ctrl+Alt+.` | 创建正向方向卡 → |
| `Ctrl+Alt+,` | 创建反向方向卡 ← |

---

## ⚙️ 插件设置

在虎鲸笔记中打开：**设置 → 插件 → 虎鲸标记**

### AI 设置

| 设置项   | 说明                          | 默认值                                       |
| -------- | ----------------------------- | -------------------------------------------- |
| API Key  | OpenAI 兼容的 API Key         | -                                            |
| API URL  | 完整 chat/completions 端点    | `https://api.openai.com/v1/chat/completions` |
| AI Model | 模型名称                      | `gpt-3.5-turbo`                              |

### 复习设置

| 设置项           | 说明                     | 默认值 |
| ---------------- | ------------------------ | ------ |
| 显示同级子块     | 答案区域显示所有同级子块 | 关闭   |
| 最大显示子块数量 | 避免子块过多影响性能     | 10     |

---

## 📱 界面说明

### Flashcard Home

点击顶部栏的 📇 图标打开 Flashcard Home，可以查看：

#### 顶部统计卡片

三个醒目的统计卡片显示学习状态：

- **未学习**（蓝色）：新卡数量，从未复习过的卡片
- **学习中**（红色）：今天到期的复习卡片，需要今天完成
- **待复习**（绿色）：已到期的积压复习任务

#### 卡组管理

- 各牌组详细统计
- 卡组备注和搜索功能
- 一键开始复习

#### 搜索功能

在 Flashcard Home 中可以快速搜索卡组：

- **实时搜索**：输入关键词即时过滤卡组列表
- **多字段搜索**：同时搜索卡组名称和备注内容
- **高亮显示**：匹配的关键词会用黄色背景高亮
- **快捷键**：按 `Escape` 键快速清空搜索
- **搜索统计**：显示匹配的卡组数量和卡片统计

### 复习界面

复习界面支持：

- 卡片类型标识（Basic / Cloze / Direction）
- 显示/隐藏答案
- 四级评分按钮
- 跳转到卡片原始位置
- 卡片管理（Bury / Suspend）

---

## 🏷️ 牌组管理

### 设置牌组

1. 创建一个普通块作为牌组名称，如"英语词汇"
2. 在 Orca 标签页面为 `#card` 标签定义 `牌组` 属性（类型：块引用）
3. 给卡片块打 `#card` 标签后，在 `牌组` 属性里引用该牌组块

### 卡组备注

每个卡组都可以添加备注来记录：

- **学习计划**：每天学习目标和复习安排
- **内容说明**：卡组包含的知识范围和特点
- **进度追踪**：学习进度和重要里程碑
- **学习心得**：复习过程中的感悟和技巧

在 Flashcard Home 中：
- 点击备注按钮（📝）添加或编辑备注
- 点击现有备注内容快速编辑
- 支持多行文本，适合详细记录

### 默认行为

- 未设置牌组的卡片归入 "Default" 分组
- 可按牌组筛选复习
- 备注数据自动保存到插件存储中

---

## 🔧 命令列表

可通过 `Ctrl+P` / `Cmd+P` 打开命令面板使用：

| 命令                | 说明                    |
| ------------------- | ----------------------- |
| 扫描带标签的卡片    | 批量扫描所有 #card 块   |
| 打开 Flashcard Home | 打开卡片主页            |
| 打开复习面板        | 开始复习会话            |
| 转换为记忆卡片      | 将当前块转为 Basic 卡片 |
| 创建 Cloze 填空     | 选中文本创建填空        |
| 创建正向方向卡      | 光标位置创建 → 分隔     |
| 创建反向方向卡      | 光标位置创建 ← 分隔     |
| AI 生成闪卡         | 从当前块生成草稿并预览保存 |
| 测试 AI 连接        | 检查 AI 服务连接        |

---

## 🛠️ 开发

### 环境要求

- Node.js **20.19+**
- npm（推荐 `npm ci`）

### 本地开发

插件在 **Orca 宿主**内加载。`index.html` 仅为静态说明页，不运行插件逻辑。

```bash
npm ci
npm run build
ORCA_PLUGIN_ROOT=/absolute/path/to/orca/plugins/orca-srs npm run deploy:local
```

### 项目结构

```
src/
├── main.ts                 # 插件入口
├── components/             # React 组件
│   ├── SrsCardDemo.tsx           # Basic 卡片复习
│   ├── ClozeCardReviewRenderer.tsx    # Cloze 卡片复习
│   ├── DirectionCardReviewRenderer.tsx # Direction 卡片复习
│   ├── FlashcardHome.tsx         # 卡片主页
│   └── ...
├── srs/                    # 核心逻辑
│   ├── algorithm.ts        # FSRS 算法
│   ├── storage.ts          # 数据存储
│   ├── cardCollector.ts    # 卡片收集
│   ├── clozeUtils.ts       # Cloze 工具
│   ├── directionUtils.ts   # Direction 工具
│   ├── ai/                 # AI 模块
│   ├── registry/           # 注册模块
│   └── settings/           # 设置模块
└── translations/           # 国际化
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add some amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

---

## 🙏 致谢

- [虎鲸笔记 (Orca Notes)](https://orca.do) - 优秀的笔记平台
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) - FSRS 算法实现
- [Anki](https://apps.ankiweb.net/) - 间隔重复学习的先驱

---

## 📞 联系

如有问题或建议，请通过以下方式联系：

- 提交 [Issue](../../issues)
- 加入讨论区

---

**Happy Learning! 🎉**
