# F2-08 计划：FSRS 设置完整校验与统一运行时参数

**状态**：done  
**开始**：2026-07-13 11:32 CST  
**完成**：2026-07-13 11:37 CST  
**执行者**：Grok Build

## 本地证据（不得猜测）

| 项 | 证据 |
| --- | --- |
| 依赖 | `ts-fsrs@5.2.3`（`node_modules/ts-fsrs`） |
| `default_w` | 长度 **21**，与项目 `DEFAULT_FSRS_WEIGHTS` 数值一致 |
| `default_request_retention` | `0.9` |
| `default_maximum_interval` | `36500` |
| `generatorParameters` | 不校验 retention 上下界；`maximum_interval: 0` 会因 `\|\|` 静默回退；不得依赖其 clip/migrate 替代本项目校验 |
| Orca 写设置 | `orca.plugins.setSettings("app", pluginName, patch)`（`plugin-docs/types/orca.md`） |

## 已确认产品规则

- 权重：仅 **恰好 21** 个有限数字字符串 token；`Number(token)` + `Number.isFinite`；拒绝 `parseFloat("1abc")` 半解析
- retention：有限 number 且闭区间 `0.7..0.99`，否则回退 `0.9`
- maximum interval：有限整数 `1..36500`，否则回退 `36500`
- 非法字段逐项回退；issue 含字段/原值摘要/中文原因/fallback
- 用户可见 warning（`orca.notify("warn")`），按非法配置指纹去重；notify 失败仅 console，不阻止安全默认
- 预览与正式评分同一 validated 路径（传 `pluginName`）
- 命令 `${pluginName}.resetFsrsSettings` 写回三项默认并清理 runtime cache

## 实现步骤

1. **`reviewSettingsSchema.ts`**：`validateFsrsConfig` / `parseFsrsWeights` 严格化 / keys + defaults patch / issue 类型
2. **`algorithm.ts`**：`getFsrsInstance` 只吃 validated；规范化参数 cache；warning 去重；`clearFsrsRuntimeState`（或同等命名）
3. **预览路径**：basic / cloze / direction / list / choice 传 `pluginName`；List/Choice 补 prop
4. **`commands.ts`**：注册/注销恢复默认命令
5. **测试 + 模块文档 + Progress 验证记录**

## 明确不做

- 不 worktree / reset / checkout / clean
- 不重构无关代码；不接受 17/19 权重兼容输入
- 不静默 fallback 成假成功
