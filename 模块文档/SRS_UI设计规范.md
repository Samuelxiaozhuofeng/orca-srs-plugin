# SRS 插件 UI 设计规范（Apple HIG 基线）

> **规范来源**：Flash Home（今日学习主页）已落地的视觉体系，是本插件唯一的设计基准。
> 所有 SRS / 渐进阅读面板必须与之对齐。令牌实现见 `src/styles/srs-design-tokens.css`（由 `src/main.ts` **最先**导入，确保后续样式表可引用）。

## 一、设计原则（Apple HIG）

| 原则 | 在本插件中的含义 |
| ---- | ---------------- |
| **Clarity（清晰）** | 一屏一个主任务。次要信息降级为 caption/chip，不与主行动争夺注意力。 |
| **Deference（谦逊）** | Chrome 让位于内容。用发丝线（hairline）+ 层次色分区，避免重边框、重底色分块。 |
| **Depth（层次）** | 用**阴影阶梯**而非边框粗细表达层级：静置 `--srs-shadow-1` → 悬停 `--srs-shadow-2` → 浮层 `--srs-shadow-overlay`。 |
| **Consistency（一致）** | 同一语义在任何面板中呈现一致：新卡=primary、今日到期=danger、积压=success、阅读=warning。 |

## 二、硬性规则（Non-negotiables）

1. **禁止硬编码裸数值**：圆角、间距、阴影、动效时长一律使用 `--srs-*` 令牌。
2. **颜色只能来自 Orca 主题变量**或本文件派生的 `--srs-accent-*` / `--srs-surface-*`；禁止写死 `#rrggbb`（`--orca-color-warning-6` 的 fallback 除外）。
3. **禁止 React 内联样式做视觉表现**（`style={{ padding, border, background, fontSize, borderRadius … }}`）。内联样式仅允许承载**运行时动态几何量**（如进度条百分比宽度、SVG `strokeDashoffset`、虚拟列表 translateY）。其余一律迁移到 CSS 类。
4. **所有自定义可点击元素**必须有 `:hover`、`:active`、`:disabled`、`:focus-visible` 四态；焦点环统一为 `2px solid var(--orca-color-primary-5)`，`outline-offset: 2px`。
5. **动效必须尊重** `prefers-reduced-motion`（令牌层已统一处理，直接用令牌即可）。
6. **不得改变任何交互行为、数据流或 DOM 语义**——本规范只约束视觉层。宿主 chrome 隐藏类（`*-host-chrome-managed`）等作用域限定选择器必须原样保留。

## 三、令牌速查

### 圆角
`--srs-radius-xs 6` chip ｜ `sm 8` 内嵌预览 ｜ `md 10` 次级按钮/列表行 ｜ `lg 12` 卡片/主按钮 ｜ `xl 20` 英雄卡/大容器 ｜ `pill 999` 徽章

> 迁移时就近取整到阶梯值（4/5→xs，7→sm，9→md，14/16→lg）。

### 间距
4pt 栅格：`--srs-space-1..8`（4/8/12/16/20/24/32）。卡片内边距 `14px 16px`（≈space-4），托盘 `space-4`，英雄卡 `30px 28px 26px`。

### 阴影
`--srs-shadow-1` 卡片静置 ｜ `-2` 悬停 ｜ `-hero` 英雄卡 ｜ `-overlay` 抽屉/弹窗 ｜ `-pill` 分段控件选中药丸

### 排版
`--srs-text-hero 44/700/tracking-tight` ｜ `display 26` ｜ `title 20/600` ｜ `subtitle 18` ｜ `heading 16/600` ｜ `callout 15/600`（主 CTA）｜ `body 14` ｜ `secondary 13` ｜ `caption 12` ｜ `micro 11/500`
数字类展示加 `font-variant-numeric: tabular-nums`。

**图标尺寸与字号阶梯分离**（图标是几何量，不承载正文缩放语义）：`--srs-icon-sm 15` 按钮内联 ｜ `-md 24` 区块标识 ｜ `-empty 48` 空状态插画级。

### 动效
`--srs-duration-base .15s` 悬停/颜色 ｜ `-slow .18s` 分段控件 ｜ `-fast .1s` 按压（`transform: translateY(0.5px)`）｜ `-gauge .4s` 进度环/进度条数值补间

### 语义色：域色 vs 状态色（**不得互相复用**）
- **域色**标识内容归属：`--srs-accent-srs`（记忆卡）/ `--srs-accent-reading`（渐进阅读）
- **状态色**标识结果好坏：`--srs-accent-success` / `--srs-accent-warn` / `--srs-accent-danger`
- **调度语义**：`--srs-accent-new` / `-due` / `-backlog` / `-future`

三组当前取值可能相同（如 `accent-reading` 与 `accent-warn` 都来自 `warning-6`），但语义不同。混用会在调色板变更时把「阅读」和「警告」绑死——**必须按语义选令牌，不按颜色选**。

### 内容测量
`--srs-measure 720` 主内容列 ｜ `-prose 420` 说明文字 ｜ `-narrow 360` 错误详情等窄栏

## 四、组件基线（照抄 Flash Home 形态）

| 组件 | 基线形态 |
| ---- | -------- |
| **卡片 Card** | `bg-1` + `1px hairline` + `radius-lg` + `shadow-1`；hover 升 `shadow-2` + `hairline-strong`；`transition: box-shadow/border-color/transform var(--srs-duration-base)` |
| **左侧状态色条** | 4px 竖条 `align-self: stretch`，色取 `--srs-accent-*` |
| **托盘 Tray** | `bg-2` + hairline + `radius-lg` + `space-4` padding，内部 `gap: space-4` |
| **徽章 Badge** | `radius-pill`，`2px 8px`，`micro/500`，底色 `bg-2`（新卡用 `primary-1`），文字取语义色 |
| **筛选 Chip** | `radius-pill`，`6px 12px`，`secondary`；选中态 `primary-1` 底 + `primary-5` 边 + `primary-6` 字 |
| **主按钮 CTA** | `min-width 208`、`11px 30px`、`radius-lg`、`15px/600` |
| **次级按钮** | `bg-1` + hairline + `radius-md` + `7px 14px` + `13px/500`，图标 15px |
| **安静按钮 Link** | 无边框透明底，`primary-6` 字，hover 仅上 `bg-2` |
| **分段控件** | 轨道 `bg-2` + hairline + `radius-lg` + 3px padding；药丸 `radius-9px`≈`sm`、`bg-1`、`shadow-pill`、`600` |
| **空状态** | 托盘内居中，`min-height 120`，`caption` 灰字 |
| **加载/错误态** | 居中，`body` 灰字；错误用 `danger-5`，附 `caption` 详情，最大宽 `--srs-measure-prose` |

## 五、布局

- 主内容居中列宽 `--srs-measure`（720px）；页面 padding `36px 24px 56px`。
- 区块间距 `--srs-space-6`（24px），组内 `space-4`。
- 窄屏断点 `420px`：横向 hero 回落纵向居中。列表类面板另按 `768px` 收起次要列。
- 字体统一 `--srs-font-family`（`-apple-system` 头部链）。

## 六、覆盖面板

| 面板 | 样式表 / 组件 |
| ---- | ------------- |
| 今日学习主页（**基准**） | `flashcard-home.css`、`src/components/flashcard-home/` |
| 卡片复习面板 | `srs-review.css`、`src/components/review-session/`、`src/components/review-card/` |
| 渐进阅读资料库 + 专注阅读 | `ir-workspace.css`、`src/components/incremental-reading/` |
| 困难卡片视图 | `src/components/DifficultCardsView.tsx` |
| AI 对话框 | `ai-card-dialog.css`、`ai-quick-interact.css` |

## 七、相关文件

| 文件 | 说明 |
| ---- | ---- |
| `src/styles/srs-design-tokens.css` | 令牌与通用基元（**唯一真源**） |
| `src/styles/flashcard-home.css` | 基准实现 |
| [SRS_卡片浏览器.md](SRS_卡片浏览器.md) | 主页布局权威文档 |
| [SRS_卡片复习窗口.md](SRS_卡片复习窗口.md) | 复习面板文档 |
| [渐进阅读.md](渐进阅读.md) | IR 面板文档 |
