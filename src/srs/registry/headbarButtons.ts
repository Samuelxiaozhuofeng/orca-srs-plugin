/**
 * Headbar 可见业务按钮配置（纯数据，便于测试）。
 * 对话框 mount 注册不在此列表中。
 */

export type HeadbarVisibleButtonSpec = {
  readonly idSuffix: string
  readonly title: string
  readonly iconClass: string
  readonly commandSuffix: string
}

/** 当前版本仅注册一个可见业务入口 */
export const VISIBLE_HEADBAR_BUTTONS: readonly HeadbarVisibleButtonSpec[] =
  Object.freeze([
    Object.freeze({
      idSuffix: "todayLearningButton",
      title: "今日学习",
      iconClass: "ti ti-calendar-check",
      commandSuffix: "openFlashcardHome"
    })
  ])

/** 历史可见按钮 id 后缀：卸载时对称清理，兼容旧版本 */
export const LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES: readonly string[] =
  Object.freeze([
    "reviewButton",
    "flashHomeButton",
    "incrementalReadingButton",
    "aiPromptLibraryButton",
    "aiServiceSettingsButton"
  ])

/** 对话框 mount（不可见业务按钮，必须保留） */
export const HEADBAR_MOUNT_SUFFIXES: readonly string[] = Object.freeze([
  "aiDialogMount",
  "aiQuickInteractMount",
  "aiPromptManagerMount",
  "aiServiceSettingsMount",
  "irBookDialogMount",
  "epubImportDialogMount",
  "webImportDialogMount"
])

export function headbarButtonId(
  pluginName: string,
  suffix: string
): string {
  return `${pluginName}.${suffix}`
}

export function listVisibleHeadbarButtonIds(pluginName: string): string[] {
  return VISIBLE_HEADBAR_BUTTONS.map((b) =>
    headbarButtonId(pluginName, b.idSuffix)
  )
}

export function listUnregisterHeadbarButtonIds(pluginName: string): string[] {
  const visible = listVisibleHeadbarButtonIds(pluginName)
  const mounts = HEADBAR_MOUNT_SUFFIXES.map((s) =>
    headbarButtonId(pluginName, s)
  )
  const legacy = LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES.map((s) =>
    headbarButtonId(pluginName, s)
  )
  return [...mounts, ...visible, ...legacy]
}
