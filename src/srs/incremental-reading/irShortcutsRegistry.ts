/**
 * 通过 Orca shortcuts API 注册默认可重绑定快捷键
 *
 * 故意不注册 Enter / Shift+Enter：
 * 会话动作快捷键必须经过 React Hook 的焦点/IME 冲突保护，
 * 全局 assign 会绕过保护并影响所有面板。
 */

export const IR_DEFAULT_SHORTCUTS = {
  createExtract: "alt+x",
  createCloze: "alt+z"
  // session next / postpone / priority：仅由 useIRShortcuts 处理
} as const

export async function registerIRDefaultShortcuts(pluginName: string): Promise<void> {
  const pairs: Array<[string, string]> = [
    [IR_DEFAULT_SHORTCUTS.createExtract, `${pluginName}.createExtract`],
    [IR_DEFAULT_SHORTCUTS.createCloze, `${pluginName}.createCloze`]
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
}
