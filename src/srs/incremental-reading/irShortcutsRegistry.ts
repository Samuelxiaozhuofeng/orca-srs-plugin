/**
 * 通过 Orca shortcuts API 注册默认可重绑定快捷键
 *
 * Enter / Shift+Enter 故意不注册：
 * 会话动作快捷键必须经过 React Hook 的焦点/IME 冲突保护，
 * 全局 assign 会绕过保护并影响所有面板。
 * 阅读/编辑模式则注册为 Orca 普通命令，使其能在原生快捷键设置中搜索和改绑。
 *
 * 默认键只做「一次性播种」：
 * orca.state.shortcuts 仅是 shortcut→command 映射（plugin-docs/types/orca.md
 * State.shortcuts），宿主无法区分「从未设置」与「用户主动解绑」——两种情况下
 * 该命令都不出现在映射里。因此用 plugin data 记录播种标记，只在首次加载时
 * assign 默认键；之后的加载不再补种，保证用户解绑/改绑的选择不被覆盖。
 *
 * unload 不回收快捷键：
 * shortcuts.assign("", command) 按命令解绑（plugin-docs/types/orca.md shortcuts.assign），
 * 无法只删默认键——若用户已把命令改绑到自定义键，回收会连自定义绑定一起抹掉；
 * 且 unload 在每次禁用/重载都会运行，绑定本身持久化在宿主数据库中属用户配置。
 * 悬空绑定仅在插件被永久删除后残留（按键无效、无实害），故按宿主惯例不回收。
 */

export const IR_DEFAULT_SHORTCUTS = {
  createExtract: "alt+x",
  createCloze: "alt+z",
  toggleViewMode: "alt+r"
  // session next / postpone / priority：仅由 useIRShortcuts 或用户手动绑定处理
} as const

/** plugin data 标记：默认快捷键已播种（存在即不再重复 assign 默认键） */
export const IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY = "ir.defaultShortcutsSeeded" as const

export async function registerIRDefaultShortcuts(pluginName: string): Promise<void> {
  const pairs: Array<[string, string]> = [
    [IR_DEFAULT_SHORTCUTS.createExtract, `${pluginName}.createExtract`],
    [IR_DEFAULT_SHORTCUTS.createCloze, `${pluginName}.createCloze`],
    [IR_DEFAULT_SHORTCUTS.toggleViewMode, `${pluginName}.irToggleViewMode`]
  ]

  // 若历史版本误绑了 Enter，主动解除
  const staleSessionShortcuts = ["enter", "shift+enter"]
  for (const shortcut of staleSessionShortcuts) {
    try {
      const bound = orca.state.shortcuts?.[shortcut]
      if (
        bound === `${pluginName}.irSessionNext` ||
        bound === `${pluginName}.irSessionPostpone`
      ) {
        await orca.shortcuts.assign("", bound)
      }
    } catch (error) {
      console.warn(`[${pluginName}] 清理会话全局快捷键失败 ${shortcut}:`, error)
    }
  }

  // 一次性播种守卫：已播种过则不再 assign，避免覆盖用户主动解绑的选择
  let alreadySeeded = false
  try {
    alreadySeeded = Boolean(
      await orca.plugins.getData(pluginName, IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY)
    )
  } catch (error) {
    // 读取失败时无法排除「用户已解绑」，保守起见本次跳过播种（不覆盖既有状态）
    console.warn(`[${pluginName}] 读取默认快捷键播种标记失败，本次跳过默认快捷键注册:`, error)
    return
  }
  if (alreadySeeded) return

  for (const [shortcut, command] of pairs) {
    try {
      const shortcuts = orca.state.shortcuts ?? {}
      const commandAlreadyBound = Object.values(shortcuts).some(bound => bound === command)
      if (commandAlreadyBound) continue

      const existing = shortcuts[shortcut]
      if (existing) continue
      await orca.shortcuts.assign(shortcut, command)
    } catch (error) {
      console.warn(`[${pluginName}] 注册快捷键失败 ${shortcut} -> ${command}:`, error)
    }
  }

  // 播种为一次性动作：即使个别键因被占用而跳过，也视为已播种，
  // 之后不再补种——后续绑定归用户在原生快捷键设置中自行管理
  try {
    await orca.plugins.setData(pluginName, IR_SHORTCUT_DEFAULTS_SEEDED_DATA_KEY, "1")
  } catch (error) {
    console.warn(
      `[${pluginName}] 写入默认快捷键播种标记失败（下次加载将重试播种）:`,
      error
    )
  }
}
