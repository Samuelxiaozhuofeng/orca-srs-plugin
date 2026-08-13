/**
 * 快捷制卡默认快捷键（一次性播种）。
 *
 * 与 `irShortcutsRegistry` 同策略：
 * - `orca.state.shortcuts` 仅是 shortcut→command 映射，宿主无法区分「从未设置」
 *   与「用户主动解绑」，因此用 plugin data 标记播种，只在首次加载 assign 默认键；
 *   之后的加载不再补种，保证用户解绑/改绑的选择永不被覆盖。
 * - unload **不回收**快捷键：`shortcuts.assign("", command)` 按命令解绑，
 *   会连用户自定义绑定一起抹掉；绑定持久化在宿主数据库中属用户配置。
 *
 * 默认只给 `quickAutoCard`（自动卡型）绑一个键——它是「选中即出卡」的万能入口，
 * 问答/填空/选择题三个命令留给用户在原生快捷键设置中自行绑定。
 */

export const QUICK_CARD_DEFAULT_SHORTCUTS = {
  quickAutoCard: "alt+c"
} as const

/** plugin data 标记：默认快捷键已播种（存在即不再重复 assign 默认键）。 */
export const QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY =
  "ai.quickCardShortcutsSeeded" as const

export async function registerQuickCardDefaultShortcuts(
  pluginName: string
): Promise<void> {
  const pairs: Array<[string, string]> = [
    [QUICK_CARD_DEFAULT_SHORTCUTS.quickAutoCard, `${pluginName}.quickAutoCard`]
  ]

  // 一次性播种守卫：已播种过则不再 assign，避免覆盖用户主动解绑的选择
  let alreadySeeded = false
  try {
    alreadySeeded = Boolean(
      await orca.plugins.getData(pluginName, QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY)
    )
  } catch (error) {
    // 读取失败时无法排除「用户已解绑」，保守起见本次跳过播种
    console.warn(
      `[${pluginName}] 读取快捷制卡默认快捷键播种标记失败，本次跳过默认快捷键注册:`,
      error
    )
    return
  }
  if (alreadySeeded) return

  for (const [shortcut, command] of pairs) {
    try {
      const shortcuts = orca.state.shortcuts ?? {}
      const commandAlreadyBound = Object.values(shortcuts).some(
        (bound) => bound === command
      )
      if (commandAlreadyBound) continue

      const existing = shortcuts[shortcut]
      if (existing) continue
      await orca.shortcuts.assign(shortcut, command)
    } catch (error) {
      console.warn(
        `[${pluginName}] 注册快捷制卡快捷键失败 ${shortcut} -> ${command}:`,
        error
      )
    }
  }

  // 播种为一次性动作：即使个别键因被占用而跳过，也视为已播种，
  // 之后不再补种——后续绑定归用户在原生快捷键设置中自行管理
  try {
    await orca.plugins.setData(
      pluginName,
      QUICK_CARD_SHORTCUTS_SEEDED_DATA_KEY,
      "1"
    )
  } catch (error) {
    console.warn(
      `[${pluginName}] 写入快捷制卡默认快捷键播种标记失败（下次加载将重试播种）:`,
      error
    )
  }
}
