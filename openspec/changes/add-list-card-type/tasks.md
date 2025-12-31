## 1. 变更实现（Implementation）

- [x] 1.1 新增卡片类型 `list`（更新 `CardType` 与 `extractCardType` 识别逻辑）
- [x] 1.2 新增斜杠命令“列表卡”，并注册对应 editor command（参考“转换为记忆卡片”）
- [x] 1.3 实现列表卡创建逻辑：
  - [x] 1.3.1 为当前块添加 `#card` 且注入 `type=list`
  - [x] 1.3.2 初始化列表条目的 SRS 状态（按 children 顺序 1..N）
  - [x] 1.3.3 必要的校验与提示（无子块/条目不足等）
- [x] 1.4 扩展 SRS 存储层支持列表条目（load/save/update/ensure/writeInitial）
- [x] 1.5 扩展卡片收集逻辑（`collectReviewCards`）生成列表条目子卡（一次只收集一个可复习条目）
- [x] 1.6 复习会话处理逻辑：
  - [x] 1.6.1 `good/easy`：追加下一条为正式复习（必要时将 due 调整为 now）
  - [x] 1.6.2 `again/hard`：后续条目 due=明天零点；当日生成“辅助预览”条目（不写日志/不更新状态）
- [x] 1.7 复习 UI 渲染：
  - [x] 1.7.1 为 list 子卡增加渲染分支（可复用 `SrsCardDemo` 框架）
  - [x] 1.7.2 为辅助预览提供明显标识与交互约束

## 2. 统计与日志（Statistics）

- [x] 2.1 确保列表条目使用“条目子块 blockId”作为复习日志的 `cardId`（天然区分每条目）
- [x] 2.2 实现“辅助预览评分不计入统计”的行为：不写入复习日志、不更新 SRS 状态，并在 UI 明确提示

## 3. 测试与验证（Validation）

- [x] 3.1 新增/更新 Vitest 单元测试：
  - [x] 3.1.1 列表条目解析与索引
  - [x] 3.1.2 列表条目 SRS 状态读写与命名
  - [ ] 3.1.3 队列收集与逐次推送规则（good/easy vs again/hard）
  - [ ] 3.1.4 辅助预览不写日志、不更新状态
- [x] 3.2 运行 `npx vitest run` 确保全部通过
- [x] 3.3 运行 `npm run build` 确保 TypeScript 编译通过

## 4. 文档（Docs）

- [x] 4.1 更新 `模块文档/` 中与卡片类型、复习队列、统计相关文档（新增列表卡说明与规则）
