# SRS TTS 语音（Azure Speech MVP）

> **状态：已落地（2026-08-02）**；审查修复同步：严格 manifest、repo asset 解析、选区 identity、对称 undo。  
> 实现路径以仓库当前代码为准。自动播放、多服务商、非 Basic 批量**不在**本 MVP 范围。

## 能力概览

1. **服务设置**：在「AI 与导入服务」对话框 **语音 TTS** Tab（Azure Speech REST）。
2. **选区单条**：工具栏「选区生成语音」→ 选中文字 → 合成 → 上传 asset → 插入原生 audio 块 → 写 `srs.tts.manifest`；**支持对称撤销**。
3. **Flash Home 批量**：卡片列表「批量语音」；仅 **Basic**；`cardKey` 去重；并发 2；可取消未开始项。
4. **复习播放**：Basic 有 manifest 时显示播放/重播（**不**自动播放）。

## 代码路径

| 职责 | 路径 |
|------|------|
| 设置 schema / hydrate / save | `src/srs/tts/ttsSettingsSchema.ts` |
| Azure REST 客户端 + SSML + MP3 校验 | `src/srs/tts/azureTtsClient.ts` |
| manifest 严格读写 | `src/srs/tts/ttsManifest.ts` |
| 生成编排 | `src/srs/tts/ttsGenerate.ts` |
| 批量过滤 / worker pool | `src/srs/tts/ttsBatch.ts` |
| 选区命令 + undo | `src/srs/tts/ttsSelectionCommand.ts` |
| 复习播放 | `src/srs/tts/ttsPlayback.ts` |
| 仓库 asset URL 解析（与 IO 共用） | `src/srs/repoAssetPath.ts` |
| 设置 UI | `AIServiceSettingsDialog.tsx` / `AIServiceSettingsMount.tsx` |
| Flash Home 批量 UI | `CardListView.tsx` + `useTtsBatchMode.ts` + `TtsBatchBar.tsx` |
| 复习播放 UI | `BasicCardReviewRenderer.tsx` |

plugin data 键：`tts.connection`（独立于 `ai.connection`）。  
块属性：`srs.tts.manifest`（**仅 type 0 JSON**）。

## 设置项

| 字段 | 说明 |
|------|------|
| provider | 固定 `azure` |
| region | Azure 区域；非法回退默认 |
| endpoint | 可选 HTTPS base；合法时优先于 region |
| apiKey | 可显隐；**不得**写入 manifest / 日志 |
| voice | 如 `zh-CN-XiaoxiaoNeural` |
| format | 固定 `audio-24khz-96kbitrate-mono-mp3` |
| rate / pitch | SSML prosody（默认 `0%`） |

试听：合成短句 → blob URL 播放；**不**写入仓库 assets。

## Asset 播放路径

`orca.utils.getAssetPath` 在真机可能对 `./xxx.mp3` **恒等返回原值**，不能单独依赖。

播放解析走 `resolveRepoAssetDisplayUrl`（`repoAssetPath.ts`，与 Image Occlusion 同源）：

- `./name.mp3` / `assets/name.mp3` / 裸文件名 → `{repoDir}/assets/...` → `file://...`
- 亦支持 `dataDir + repo` 拼路径
- 绝对路径 → `file://`
- `http(s)` / `file` / `blob` / `data` 原样
- `repoDir` 不可用 → **明确失败 reason**，不生成假 URL

## Manifest（严格）

```json
{
  "version": 1,
  "entries": [
    {
      "cardKey": "basic:123",
      "assetPath": "./xxx.mp3",
      "audioBlockId": 456,
      "textHash": "a1b2c3d4",
      "textPreview": "可选预览…",
      "provider": "azure",
      "voice": "zh-CN-XiaoxiaoNeural",
      "format": "audio-24khz-96kbitrate-mono-mp3",
      "createdAt": "2026-08-02T00:00:00.000Z"
    }
  ]
}
```

### 读写语义

| 情况 | 行为 |
|------|------|
| 属性不存在 | 返回空 manifest |
| 属性存在但 value 为 `null` / 空字符串 | **抛错**（按损坏数据处理，禁止覆盖） |
| JSON 解析失败 | **抛错**（不得静默成空后覆盖） |
| 未知 `version` | **抛错** |
| `entries` 非数组 | **抛错** |
| 任一 entry 缺必填字段 | **抛错**（不静默过滤成部分列表） |
| 写入 | **仅 type 0 JSON**；失败立即抛（含 blockId / 属性名） |
| 写失败 | **不** Text fallback；**不** `invalidateBlockCache` |
| 写成功 | 再 `invalidateBlockCache` |

### 目标 key

- Basic 卡（真实 `#card` 且 `extractCardType === "basic"`）：`cardIdentity` → `basic:{id}`
- 其它（普通块、cloze/choice/…）：`block:{id}`
- **禁止**用 `srs.isCard` 属性启发式；无 `#card` 时即使 extract 默认 basic 也用 `block:{id}`

### 重复 / 替换

- 默认跳过：同 `cardKey + textHash + voice + format`
- 重新生成：upsert 同 cardKey；**不**删除旧 audio 块 / asset

## 写入顺序与失败

1. 请求音频 → 2. 校验 → 3. `upload-asset-binary` → 4. `insertBlock` audio sibling after → 5. 写 manifest → invalidate  

任一步失败标明 step；insert 成功而 manifest 失败时错误含 **audioBlockId** 与 assetPath。

真机样本（repo `6emicuv1sv76k`，block `18431`）确认原生块文本为
`audio: ./audio-phwuiggjj4ffq.mpeg`；对应 asset 被识别为 24 kHz、96 kbps、
单声道 MPEG Layer III，与本模块的 `content + repr` 写入形态一致。

## 对称 undo（选区命令）

`registerEditorCommand` doFn 在 **created** 时返回 `{ ret, undoArgs }`：

- `targetBlockId` / `audioBlockId` / `previousManifestProp`（生成前快照；无则 `null`）/ `assetPath`（诊断用）

undoFn：

1. `core.editor.deleteBlocks` 删除本次 audio 块  
2. 恢复 manifest：原有则按原 `type`/`value` `setProperties`；无则 `deleteProperties`  
3. `invalidateBlockCache`  

- **skipped / 失败** 不返回可误删内容的 undoArgs  
- 任一步失败：`console.error` + `notify(error)` + **抛出**  
- **不删除 asset**（宿主无可靠删除 API）；撤销后可能留下孤立 asset（见日志）

## 批量规则

- 当前列表筛选结果，不全库扫描  
- 仅 Basic；`cardKey` 去重  
- 来源 `ReviewCard.front`；并发 2；取消未开始；可重试失败项  
- UI：`useTtsBatchMode` + `TtsBatchBar`

## 测试

| 文件 | 覆盖 |
|------|------|
| `ttsSettingsSchema.test.ts` | normalize / HTTPS / hydrate / save |
| `azureTtsClient.test.ts` | SSML / MP3 / 401 脱敏 / 无流响应实际大小上限 |
| `ttsManifest.test.ts` | 损坏 JSON / 未知版本 / 非法 entry / 写失败不 fallback 不失效缓存 |
| `ttsGenerate.test.ts` | skip / 成功 / manifest 失败 |
| `ttsBatch.test.ts` | 过滤 / 并发取消 / 重试 |
| `ttsPlayback.test.ts` | 恒等 getAssetPath+repoDir / repoDir 失败 / 损坏 manifest |
| `ttsSelectionCommand.test.ts` | Basic / 普通块 / cloze；undo 恢复/删除；undoArgs 形状 |
| `repoAssetPath.test.ts` | 路径解析共用逻辑 |

## 需 Orca 真机验证

1. 服务设置保存 + 试听  
2. 选区 → audio 块渲染；**Cmd/Ctrl+Z 撤销** 删 audio 并恢复 manifest  
3. asset 进入仓库 `assets`；撤销后孤立 asset 是否可接受  
4. 复习播放 `file://` 可听（尤其 `./xxx.mp3` 恒等 getAssetPath 场景）  
5. Flash Home 批量：勾选 / 取消 / 非 Basic 不可选  

## 明确不做（MVP）

- 自动播放  
- 非 Azure 服务商 UI  
- Cloze / List / Choice / IO 批量  
- Azure Speech SDK / 新 npm 依赖  
- 静默删除旧 audio 块或 asset  
