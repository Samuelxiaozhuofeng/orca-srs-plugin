# SRS 图片遮罩（Image Occlusion）

> **文档同步日期**：2026-08-02
> **状态**：已落地（矩形 + 同号多区组交互 + 每图三段式复习模式）

---

## 概述

在图片上绘制矩形遮罩，每个编号 `cN` 生成一张独立 FSRS 卡片（语义对齐 Anki Image Occlusion，卡型与文字 cloze **分离**）。

### 用户操作

| 入口 | 说明 |
|------|------|
| 斜杠 `/io` | `openImageOcclusionEditor` |
| 块右键「图片遮罩」 | 非查询块 |
| 命令面板「SRS: 图片遮罩（IO）」 | 同上 |

### 编辑器（Modal）

1. 自动收集宿主块上的 **图片块 / 行内图 / 直接子块图**；多图时先选源
2. **绘制 / 选择** 模式切换（图标 + 文案；窄屏可只显图标）
3. **绘制**：拖拽画矩形；画笔编号可复用（同号多区 = 一张卡）；点已有区域只切换画笔，不误画
4. **选择**：单击选区；Shift 切换多选；空白拖拽 **框选相交**；双击进入该遮罩组（选中同 `n` 全部，并设为当前组）
5. 单选可拖动，角/边控制柄缩放；多选整体平移；坐标限制在图片 `[0,1]`；**不重建 region.id**
6. **组合为一张卡**：至少两区且跨多个 `n`；目标固定为所选中 **最小现有 cN**；确认后改 `n` 并 compact，**不立即写后端**
7. **解组**：当前聚焦组 ≥2 区；聚焦区保留原 `n` 与进度，其余分配新临时编号；**不复制 SRS 状态**
8. **批量删除** 选中区（确认）；删光某编号后本地 compact；保存时走 pending SRS
9. **复习模式**（每图）：`只遮当前` / `全遮揭当前` / `全遮揭全部`；**编辑 / 题面 / 答案** 分段预览（题面/答案禁用几何编辑）
10. **保存**：masks + `srs.io.src` + `srs.io.mode` + pending 同次 `setProperties`，再迁移 SRS 并 `invalidateBlockCache`
11. **交互取消**：pointercancel / Esc / 切换工具或预览 / 关闭前若正在拖动，则回滚 origin，不提交半途几何；draw/marquee 取消不产生区域/选区副作用

### 复习

| 模式 | 题面 | 答案 |
|------|------|------|
| `hideOne` | 只遮当前编号 | 全部揭开 |
| `hideAll` | 遮全部 | 只揭当前编号 |
| `hideAllRevealAll` | 遮全部 | 全部揭开 |

- **每图** `srs.io.mode` 优先于全局 `review.imageOcclusionMode`
- 旧卡无每图属性时继承校验后的全局默认；**不做批量迁移**
- 非法每图值 `console.warn` 后回退全局（不静默当合法）
- 可见遮罩由纯函数 `getVisibleIoMaskRegions` 决定，编辑器预览与复习共用
- 进入一张卡时，评分按钮 interval / due 共用冻结的 `previewNow`；`ReviewGradeButtons` 共用组件

---

## 数据结构

### 标签与类型

| 项 | 值 |
|----|-----|
| `#card.type` | `image-occlusion`（兼容读 `io`） |
| `srs.isCard` | `true` |
| `_repr`（纯图片宿主） | `{ type: "srs.image-occlusion", src }` + 编辑器徽章 IO×N |
| 行内图宿主 | **不改**正文 `_repr`（保持可编辑文本）；列表/浏览器显示遮罩 cN |

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `srs.io.masks` | Text (1) JSON | `{ version:1, regions:[{id,n,shape:"rect",x,y,w,h}] }`，坐标相对图 [0,1] |
| `srs.io.src` | Text | 制卡时图片 src；换图后仍尽量用相对坐标 |
| `srs.io.mode` | Text | 每图复习模式：`hideOne` \| `hideAll` \| `hideAllRevealAll` |
| `srs.io.pendingSrs` | Text (1) JSON | 紧凑 masks 后未完成的 SRS 删/迁计划；成功后删除 |
| `srs.io.prevRepr` | Text | 纯图片宿主备份原 `_repr` |
| `srs.c{N}.*` | 同 cloze | 每编号独立 FSRS（复用 cloze 存储 API） |
| `srs.c{N}.suspended` | Boolean | 仅暂停该遮罩编号；随 cN 前缀迁移一起移动 |

**清理对称**：末变体 `removeIoNumberFromMasks` 与 `IO_HOST_PROPERTY_NAMES` 删除 masks/src/mode/prevRepr/pending；整卡 `deleteCardSrsData` 删全部 `srs.*`。禁止留下孤儿 `srs.io.mode`。

### 身份

- `cardType`: `image-occlusion`
- `cardKey`: `io:{blockId}:c{N}`（仅经 `cardIdentity.ts`）
- `ReviewCard.clozeNumber`: 遮罩编号（仅作变体字段，**不是**文字 cloze）

禁止与 cloze / direction / list / choice / topic / extracts 同块混用。

---

## 组交互与 SRS 进度

| 操作 | 本地变换 | 保存后进度 |
|------|----------|------------|
| 组合 | 所选区域 → 最小 n，再 compact | 目标 n **保留**；仅当某来源 n 的**全部**区域都被并入目标时，该卡才删除进度（`fullyAbsorbedNs`）；仅移动部分区域的来源 n（`partialSourceNs`）**仍保留**卡与进度；目标 n 上未选区域本来就在该卡，不变 |
| 解组 | 优先让聚焦的旧区保留 n；若聚焦区是新画的，则改由组内旧区承接进度 | 原组只保留一份进度；其余新号 `created`（不复制状态） |
| 删区 | 删 id 后 compact | 删光的编号 delete；其余按 id 迁移 |
| 移动/缩放 | 改 x/y/w/h，**id 不变** | 无编号变更则 keep |

组合元数据（`groupIoRegionsToMinNumber`）：`movedFromNs` / `fullyAbsorbedNs` / `partialSourceNs` / `targetHadUnselected`；确认文案 `formatIoGroupConfirmMessage` 与上述一致，不得写「被合并的 n 一律删除」。

纯函数（可单测，不写后端）：`groupIoRegionsToMinNumber`、`ungroupIoFocusedGroup`、`deleteIoRegionsByIds`、`translateIoRegionsClamped`、`resizeIoRegionClamped`、`getVisibleIoMaskRegions`。Pointer 状态机：`ioEditorInteraction` 的 begin/move/commit/cancel。保存仍经 `withIoBlockLock` + pending SRS + cache invalidation。

---

## 核心文件

| 路径 | 职责 |
|------|------|
| `src/srs/imageOcclusion.ts` | 模型、源解析、区域变换、mode、可见遮罩、保存/删编号 |
| `src/components/image-occlusion/ImageOcclusionEditorMount.tsx` | Modal 壳 + `openImageOcclusionEditor` |
| `src/components/image-occlusion/ImageOcclusionEditorBody.tsx` | 主体 JSX 组合 |
| `src/components/image-occlusion/useIoEditorController.ts` | 加载/保存/组操作编排 hook |
| `src/components/image-occlusion/useIoEditorPointer.ts` | pointer 捕获与 session 同步 |
| `src/components/image-occlusion/useIoEditorKeyboard.ts` | Escape / Delete 快捷键生命周期与交互元素守卫 |
| `src/components/image-occlusion/ioEditorInteraction.ts` | 绘制/框选/移动/缩放 pure commit·cancel |
| `src/components/image-occlusion/ImageOcclusionEditorToolbar.tsx` | 工具/画笔/模式/预览工具栏 |
| `src/components/image-occlusion/ImageOcclusionEditorCanvas.tsx` | 画布 frame、区域、控制柄 |
| `src/components/image-occlusion/ImageOcclusionReviewRenderer.tsx` | 复习 UI |
| `src/components/image-occlusion/ImageOcclusionBlockRenderer.tsx` | 编辑器原图 + 徽章 |
| `src/styles/image-occlusion.css` | 样式 |
| `src/srs/settings/reviewSettingsSchema.ts` | 全局默认 + 三段模式解析 |
| `cardIdentity` / `reviewCardFactory` / Flash Home 删除 | 收集与清理接入 |

---

## 遮罩几何与显示

- 坐标相对 **图片内容框**（`.srs-io-frame`），不是外层滚动容器；编辑 / 复习 / 块预览共用 `regionStylePercent`。
- 遮罩 **实心不透明**（`#12141a`），挡住下方文字。
- 保存后 **纯图片宿主块**（`source.kind=block-repr`）切换为 `srs.image-occlusion`，笔记中 **持续显示** 全部实心遮罩 + `IO×N`；原 `_repr` 备份到 `srs.io.prevRepr`，整卡删除时恢复。
- **行内图 / 子块图** 宿主：v1 **不**改宿主 `_repr`，笔记正文无实心预览；编辑 Modal 与复习仍正确显示遮罩。
- 二次保存会删除 masks 中已消失编号的 `srs.cN.*`，并将洞号后的编号前移（紧凑 1..k），进度按 **region id** 迁移（`moveClozeCardSrsData`）。
- 暂停/恢复按遮罩编号隔离。Flash Home include-suspended 路径显示 `io:{blockId}:cN` 行；旧整块暂停恢复时以结构化 `cardType=image-occlusion` + 后端最新 masks 判断其它编号，不能依赖 `_repr`（行内图/子块图宿主不改 `_repr`）。缺 masks、目标编号已删除或后端读取失败均拒绝清整块暂停。
- **挂起迁移** `srs.io.pendingSrs`：与 masks **同次写入**；SRS 删/迁全部成功后删除。中断后再次保存/删除会先 `resumePendingIoSrsOps` 幂等重放。
- Flash Home / 变体删除：`removeIoNumberFromMasks` 内完成 compact + pending + SRS；缺 masks / 编号不在 masks → **抛错**。返回 `ioRenames` 供列表同步 `clozeNumber`。
- 同块 IO 写路径经 `withIoBlockLock` 进程内串行；`moveClozeCardSrsData(requireSource)` 源缺失且目标空 → 抛错；目标非空拒绝覆盖。
- 整卡删除恢复 `_repr`：**仅**当有 `srs.io.prevRepr` 或 live type 仍为 `srs.image-occlusion` 时执行；禁止用 `srs.io.src` 把行内/子块文本宿主改写成 image。

## 图片路径（宿主对齐）

仓库内图片块 `_repr` 常见形态：

```json
{ "type": "image", "src": "./image-xxx.png" }
```

文件落在 **`{repoDir}/assets/image-xxx.png`**。
展示 URL：`resolveImageDisplayUrl` / `resolveRepoAssetAbsolutePath`（`orca.utils.getAssetPath` 在宿主中是恒等，**不能**单独依赖）。

## 限制

- 仅矩形；无标签文字
- 无子块备注挂载（`childrenJsx=null`）
- 行内图宿主无编辑器角标（徽章仅 `srs.image-occlusion` 图片块）
- 不导入 Anki apkg IO
- masks 保持 **version 1**（组由 `region.n` 表达，无独立 schema）

## 验证（自动化）

- `npx vitest run src/srs/imageOcclusion.test.ts`
- `npx vitest run src/components/image-occlusion/`
- 相关：compact / planIoSrs / 组合全吸收与部分移动 / 解组 / move·resize commit·cancel / 三模式可见遮罩 / 每图优先 / 清理属性表含 mode
- 真实 Orca 指针捕获、框选、组合确认与预览需人工验收

---

## 相关

- [SRS_填空卡.md](./SRS_填空卡.md)（对比：fragment vs 几何）
- [SRS_数据存储.md](./SRS_数据存储.md)
- [SRS_卡片创建与管理.md](./SRS_卡片创建与管理.md)
