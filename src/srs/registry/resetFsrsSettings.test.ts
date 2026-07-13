/**
 * F2-08：恢复 FSRS 默认设置 helper / 命令注册与注销
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_REQUEST_RETENTION,
  REVIEW_SETTINGS_KEYS
} from "../settings/reviewSettingsSchema"
import { clearFsrsRuntimeState, getEffectiveFsrsParams } from "../algorithm"
import {
  getResetFsrsSettingsCommandId,
  registerCommands,
  resetFsrsSettingsToDefaults,
  unregisterCommands
} from "./commands"

const PLUGIN = "test-reset-fsrs"

type Registered = Map<string, { fn: (...args: unknown[]) => unknown; label: string }>

function installOrcaHarness() {
  const commands: Registered = new Map()
  const setSettings = vi.fn(async (_to: string, _name: string, patch: Record<string, unknown>) => {
    const prev = (orca.state.plugins[PLUGIN]?.settings ?? {}) as Record<string, unknown>
    ;(orca.state.plugins[PLUGIN] as { settings: Record<string, unknown> }).settings = {
      ...prev,
      ...patch
    }
  })
  const notify = vi.fn()

  ;(globalThis as { orca?: unknown }).orca = {
    state: {
      plugins: {
        [PLUGIN]: {
          settings: {
            [REVIEW_SETTINGS_KEYS.fsrsWeights]: "bad-weights",
            [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: 1.5,
            [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: -10
          }
        }
      },
      blocks: {}
    },
    notify,
    plugins: {
      setSettings
    },
    commands: {
      registerCommand: (id: string, fn: (...args: unknown[]) => unknown, label: string) => {
        commands.set(id, { fn, label })
      },
      registerEditorCommand: vi.fn(),
      unregisterCommand: (id: string) => {
        commands.delete(id)
      },
      unregisterEditorCommand: vi.fn()
    }
  }

  return { commands, setSettings, notify }
}

beforeEach(() => {
  clearFsrsRuntimeState()
  vi.restoreAllMocks()
})

afterEach(() => {
  try {
    unregisterCommands(PLUGIN)
  } catch {
    /* harness 可能未完整注册 editor 命令 */
  }
  clearFsrsRuntimeState()
})

describe("resetFsrsSettingsToDefaults", () => {
  it("写入三项默认并清理 runtime", async () => {
    const { setSettings } = installOrcaHarness()
    // 先用非法配置污染 runtime
    const { getFsrsInstance } = await import("../algorithm")
    getFsrsInstance(PLUGIN)
    expect(getEffectiveFsrsParams().requestRetention).toBe(DEFAULT_REQUEST_RETENTION)

    await resetFsrsSettingsToDefaults(PLUGIN)

    expect(setSettings).toHaveBeenCalledWith(
      "app",
      PLUGIN,
      expect.objectContaining({
        [REVIEW_SETTINGS_KEYS.fsrsWeights]: DEFAULT_FSRS_WEIGHTS,
        [REVIEW_SETTINGS_KEYS.fsrsRequestRetention]: DEFAULT_REQUEST_RETENTION,
        [REVIEW_SETTINGS_KEYS.fsrsMaximumInterval]: DEFAULT_MAXIMUM_INTERVAL
      })
    )
    const settings = orca.state.plugins[PLUGIN]?.settings as
      | Record<string, unknown>
      | undefined
    expect(settings?.[REVIEW_SETTINGS_KEYS.fsrsWeights]).toBe(DEFAULT_FSRS_WEIGHTS)
    expect(getEffectiveFsrsParams().maximumInterval).toBe(DEFAULT_MAXIMUM_INTERVAL)
  })

  it("setSettings 失败时抛出且不假装成功", async () => {
    const { setSettings } = installOrcaHarness()
    setSettings.mockRejectedValueOnce(new Error("disk full"))
    await expect(resetFsrsSettingsToDefaults(PLUGIN)).rejects.toThrow("disk full")
  })
})

describe("resetFsrsSettings command register/unregister", () => {
  it("注册命令 ID/label，执行成功路径 notify success", async () => {
    const { commands, notify, setSettings } = installOrcaHarness()
    registerCommands(PLUGIN)

    const id = getResetFsrsSettingsCommandId(PLUGIN)
    expect(id).toBe(`${PLUGIN}.resetFsrsSettings`)
    const entry = commands.get(id)
    expect(entry).toBeDefined()
    expect(entry!.label).toBe("SRS: 恢复 FSRS 默认设置")

    await entry!.fn()
    expect(setSettings).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      "success",
      expect.stringMatching(/已恢复 FSRS 默认设置/),
      expect.objectContaining({ title: "SRS FSRS 设置" })
    )
  })

  it("执行失败路径 console.error + notify error", async () => {
    const { commands, notify, setSettings } = installOrcaHarness()
    setSettings.mockRejectedValueOnce(new Error("denied"))
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    registerCommands(PLUGIN)

    await commands.get(getResetFsrsSettingsCommandId(PLUGIN))!.fn()
    expect(errSpy).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringMatching(/恢复 FSRS 默认设置失败/),
      expect.objectContaining({ title: "SRS FSRS 设置" })
    )
    errSpy.mockRestore()
  })

  it("unregisterCommands 注销 reset 命令", () => {
    const { commands } = installOrcaHarness()
    registerCommands(PLUGIN)
    const id = getResetFsrsSettingsCommandId(PLUGIN)
    expect(commands.has(id)).toBe(true)
    unregisterCommands(PLUGIN)
    expect(commands.has(id)).toBe(false)
  })
})
