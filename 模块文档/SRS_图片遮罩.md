# SRS 图片遮罩（Image Occlusion）

> **文档同步日期**：2026-08-02  
> **状态**：已落地 v1（矩形 + 同号多区 + 全局 hide 模式）

---

## 概述

在图片上绘制矩形遮罩，每个编号 `cN` 生成一张独立 FSRS 卡片（语义对齐 Anki Image Occlusion，卡型与文字 cloze **分离**）。

### 用户操作

| 入口 | 说明 |
|------|------|
| 斜杠 `/io` | `openImageOcclusionEditor` |
| 块右键「图片遮罩」 | 非查询块 |
| 命令面板「SRS: 图片遮罩（IO）」 | 同上 |

编辑器（Modal）：

1. 自动收集宿主块上的 **图片块 / 行内图 / 直接子块图**；多图时先选源  
2. 拖拽画矩形；**画笔编号**可复用（同号多区 = 一张卡）  
3. 选中区域可 Delete 删除；保存写入属性并初始化缺失的 `srs.cN.*`  
4. 再次打开同一命令可继续编辑（已有进度的编号 ensure 不覆盖）

### 复习

全局设置 `review.imageOcclusionMode`：

| 值 | 行为 |
|----|------|
| `hideOne`（默认） | 只遮当前编号区域 |
| `hideAll` | 遮全部区域；显示答案时揭示当前编号 |

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
| `srs.c{N}.*` | 同 cloze | 每编号独立 FSRS（复用 cloze 存储 API） |

### 身份

- `cardType`: `image-occlusion`
- `cardKey`: `io:{blockId}:c{N}`
- `ReviewCard.clozeNumber`: 遮罩编号（仅作变体字段，**不是**文字 cloze）

禁止与 cloze / direction / list / choice / topic / extracts 同块混用。

---

## 核心文件

| 路径 | 职责 |
|------|------|
| `src/srs/imageOcclusion.ts` | 模型、源解析、保存、删编号 |
| `src/components/image-occlusion/ImageOcclusionEditorMount.tsx` | 编辑 Modal |
| `src/components/image-occlusion/ImageOcclusionReviewRenderer.tsx` | 复习 UI |
| `src/components/image-occlusion/ImageOcclusionBlockRenderer.tsx` | 编辑器原图 + 徽章 |
| `src/styles/image-occlusion.css` | 样式 |
| `src/srs/settings/reviewSettingsSchema.ts` | `review.imageOcclusionMode` |
| `cardIdentity` / `reviewCardFactory` / `deletedCardCleanup` / Flash Home 删除 | 收集与清理接入 |

---

## 遮罩几何与显示

- 坐标相对 **图片内容框**（`.srs-io-frame`），不是外层滚动容器；编辑 / 复习 / 块预览共用 `regionStylePercent`。
- 遮罩 **实心不透明**（`#12141a`），挡住下方文字；显示答案时当前编号揭开（去掉遮罩）。
- 保存后 **纯图片宿主块**（`source.kind=block-repr`）切换为 `srs.image-occlusion`，笔记中 **持续显示** 全部实心遮罩 + `IO×N`；原 `_repr` 备份到 `srs.io.prevRepr`，整卡删除时恢复。
- **行内图 / 子块图** 宿主：v1 **不**改宿主 `_repr`，笔记正文无实心预览；编辑 Modal 与复习仍正确显示遮罩（产品合同收窄，非遗漏吞错）。
- **旧版**（相对滚动容器画的）遮罩可能错位，需在编辑器中重画后保存。
- 二次保存会删除 masks 中已消失编号的 `srs.cN.*`；删变体写序为 **先 masks 后 SRS**，且强制 backend 读。
- 整卡删除恢复 `_repr`：**仅**当有 `srs.io.prevRepr` 或 live type 仍为 `srs.image-occlusion` 时执行；禁止用 `srs.io.src` 把行内/子块文本宿主改写成 image（2026-08-02 Sol 复核 High）。

## 图片路径（宿主对齐）

仓库内图片块 `_repr` 常见形态：

```json
{ "type": "image", "src": "./image-xxx.png" }
```

文件落在 **`{repoDir}/assets/image-xxx.png`**（例：`…/orca/repos/{id}/assets/`）。  
展示 URL 解析与宿主原生 image 块一致：

1. `./name` → 去掉 `./` → `{repoDir}/assets/name`  
2. 再包一层 `file://…` 供 `<img src>` 使用  

实现：`resolveImageDisplayUrl` / `resolveRepoAssetAbsolutePath`（`orca.utils.getAssetPath` 在宿主中是恒等，**不能**单独依赖）。

## 限制（v1）

- 仅矩形；无标签文字  
- 无子块备注挂载（`childrenJsx=null`）  
- 行内图宿主无编辑器角标（徽章仅 `srs.image-occlusion` 图片块）；Flash Home 有「遮罩 cN」  
- 不导入 Anki apkg IO  
- 宿主 image `_repr` 字段依赖运行时探测（`type=image` + `src` 及常见别名）

---

## 相关

- [SRS_填空卡.md](./SRS_填空卡.md)（对比：fragment vs 几何）  
- [SRS_数据存储.md](./SRS_数据存储.md)  
- [SRS_卡片创建与管理.md](./SRS_卡片创建与管理.md)
