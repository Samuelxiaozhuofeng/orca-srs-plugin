import { afterEach, describe, expect, it, vi } from "vitest"
import {
  IR_SELECTION_TOOLBAR_PREFS_DATA_KEY,
  IR_TOOLBAR_ACTION_MARKER_CLASS,
  IR_TOOLBAR_ACTION_TABLER_ICON,
  buildIROnlyToolbarBaseHideCss,
  buildIRSelectionToolbarHideCss,
  buildToolbarActionIconClass,
  classifyToolbarButtonIcons,
  classifyToolbarIconToken,
  clearIRSelectionToolbarPrefsCache,
  extractIconClassTokens,
  getDefaultIRSelectionToolbarSettings,
  getIRSelectionToolbarSettings,
  hydrateIRSelectionToolbarSettings,
  listHiddenIconTokensForContext,
  normalizeIRSelectionToolbarSettings,
  resolveToolbarButtonVisibility,
  saveIRSelectionToolbarSettings,
  type IRSelectionToolbarSettings
} from "./irSelectionToolbarSettings"

const PLUGIN = "orca-srs"

describe("irSelectionToolbarSettings", () => {
  afterEach(() => {
    clearIRSelectionToolbarPrefsCache()
    delete (globalThis as { orca?: unknown }).orca
    vi.restoreAllMocks()
  })

  function installOrca(plugins: {
    getData?: (...args: unknown[]) => unknown
    setData?: (...args: unknown[]) => unknown
  }): void {
    ;(globalThis as unknown as { orca: unknown }).orca = { plugins }
  }

  it("defaults: extract/cloze/explain ON; aiMenu/tts OFF; all format groups OFF", () => {
    const d = getDefaultIRSelectionToolbarSettings()
    expect(d.actions).toEqual({
      extract: true,
      cloze: true,
      explain: true,
      aiMenu: false,
      tts: false
    })
    for (const v of Object.values(d.formatGroups)) {
      expect(v).toBe(false)
    }
  })

  it("normalize fills defaults for null / empty / malformed roots", () => {
    const d = getDefaultIRSelectionToolbarSettings()
    expect(normalizeIRSelectionToolbarSettings(null)).toEqual(d)
    expect(normalizeIRSelectionToolbarSettings(undefined)).toEqual(d)
    expect(normalizeIRSelectionToolbarSettings("nope")).toEqual(d)
    expect(normalizeIRSelectionToolbarSettings([])).toEqual(d)
    expect(normalizeIRSelectionToolbarSettings(42)).toEqual(d)
  })

  it("normalize keeps valid booleans and ignores unknown keys / bad types", () => {
    const value = normalizeIRSelectionToolbarSettings({
      actions: {
        extract: false,
        cloze: true,
        explain: false,
        aiMenu: true,
        tts: "yes",
        legacy: true
      },
      formatGroups: {
        basicFormat: true,
        underline: 1,
        mystery: false
      },
      extra: true
    })
    expect(value.actions.extract).toBe(false)
    expect(value.actions.cloze).toBe(true)
    expect(value.actions.explain).toBe(false)
    expect(value.actions.aiMenu).toBe(true)
    expect(value.actions.tts).toBe(false)
    expect(value.formatGroups.basicFormat).toBe(true)
    expect(value.formatGroups.underline).toBe(false)
    expect((value as { extra?: unknown }).extra).toBeUndefined()
  })

  it("get before hydrate returns defaults", () => {
    expect(getIRSelectionToolbarSettings(PLUGIN)).toEqual(
      getDefaultIRSelectionToolbarSettings()
    )
  })

  it("hydrate malformed JSON warns and uses defaults", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    installOrca({
      getData: vi.fn(async () => "{not-json")
    })
    const value = await hydrateIRSelectionToolbarSettings(PLUGIN)
    expect(value).toEqual(getDefaultIRSelectionToolbarSettings())
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      IR_SELECTION_TOOLBAR_PREFS_DATA_KEY
    )
  })

  it("hydrate read failure warns and uses defaults", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    installOrca({
      getData: vi.fn(async () => {
        throw new Error("disk down")
      })
    })
    const value = await hydrateIRSelectionToolbarSettings(PLUGIN)
    expect(value).toEqual(getDefaultIRSelectionToolbarSettings())
    expect(warn).toHaveBeenCalled()
  })

  it("hydrate legacy partial object merges defaults", async () => {
    installOrca({
      getData: vi.fn(async () =>
        JSON.stringify({ actions: { aiMenu: true } })
      )
    })
    const value = await hydrateIRSelectionToolbarSettings(PLUGIN)
    expect(value.actions.aiMenu).toBe(true)
    expect(value.actions.extract).toBe(true)
    expect(value.formatGroups.basicFormat).toBe(false)
  })

  it("save writes JSON and updates cache", async () => {
    const setData = vi.fn(async () => {})
    installOrca({ setData })
    const next: IRSelectionToolbarSettings = {
      ...getDefaultIRSelectionToolbarSettings(),
      actions: {
        ...getDefaultIRSelectionToolbarSettings().actions,
        tts: true
      }
    }
    const saved = await saveIRSelectionToolbarSettings(PLUGIN, next)
    expect(saved.actions.tts).toBe(true)
    expect(setData).toHaveBeenCalledWith(
      PLUGIN,
      IR_SELECTION_TOOLBAR_PREFS_DATA_KEY,
      expect.any(String)
    )
    expect(getIRSelectionToolbarSettings(PLUGIN).actions.tts).toBe(true)
  })

  it("classifies plugin actions only via unique markers, not bare Tabler", () => {
    expect(
      classifyToolbarIconToken(IR_TOOLBAR_ACTION_MARKER_CLASS.cloze)
    ).toEqual({ kind: "action", action: "cloze" })
    expect(
      classifyToolbarIconToken(IR_TOOLBAR_ACTION_MARKER_CLASS.extract)
    ).toEqual({ kind: "action", action: "extract" })
    expect(
      classifyToolbarIconToken(IR_TOOLBAR_ACTION_MARKER_CLASS.explain)
    ).toEqual({ kind: "action", action: "explain" })
    expect(
      classifyToolbarIconToken(IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu)
    ).toEqual({ kind: "action", action: "aiMenu" })
    expect(
      classifyToolbarIconToken(IR_TOOLBAR_ACTION_MARKER_CLASS.tts)
    ).toEqual({ kind: "action", action: "tts" })

    // 其它插件仅挂 ti-bulb / ti-scissors 等 → 未知，保持可见
    expect(classifyToolbarIconToken(IR_TOOLBAR_ACTION_TABLER_ICON.explain)).toEqual({
      kind: "unknown"
    })
    expect(classifyToolbarIconToken(IR_TOOLBAR_ACTION_TABLER_ICON.extract)).toEqual({
      kind: "unknown"
    })
    expect(classifyToolbarIconToken(IR_TOOLBAR_ACTION_TABLER_ICON.cloze)).toEqual({
      kind: "unknown"
    })
    expect(classifyToolbarIconToken("ti-new-future-icon")).toEqual({
      kind: "unknown"
    })
  })

  it("classifies native format icons by Tabler tokens", () => {
    expect(classifyToolbarIconToken("ti-bold")).toEqual({
      kind: "format",
      group: "basicFormat"
    })
    expect(classifyToolbarIconToken("ti-underline-wave")).toEqual({
      kind: "format",
      group: "underline"
    })
    expect(classifyToolbarIconToken("ti-letter-t")).toEqual({
      kind: "format",
      group: "textColor"
    })
    expect(classifyToolbarIconToken("ti-highlight")).toEqual({
      kind: "format",
      group: "highlight"
    })
    expect(classifyToolbarIconToken("ti-text-increase")).toEqual({
      kind: "format",
      group: "fontSize"
    })
    expect(classifyToolbarIconToken("ti-link")).toEqual({
      kind: "format",
      group: "linkQuote"
    })
    expect(classifyToolbarIconToken("ti-superscript")).toEqual({
      kind: "format",
      group: "mathScript"
    })
    expect(classifyToolbarIconToken("ti-paint")).toEqual({
      kind: "format",
      group: "clearFormat"
    })
  })

  it("buildToolbarActionIconClass includes Tabler + unique marker", () => {
    const icon = buildToolbarActionIconClass("explain")
    expect(icon).toContain("ti-bulb")
    expect(icon).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.explain)
    expect(extractIconClassTokens(icon)).toEqual(
      expect.arrayContaining([
        "ti-bulb",
        IR_TOOLBAR_ACTION_MARKER_CLASS.explain
      ])
    )
  })

  it("extractIconClassTokens skips bare ti and keeps markers", () => {
    expect(
      extractIconClassTokens("ti ti-braces orca-srs-stb-cloze")
    ).toEqual(["ti-braces", "orca-srs-stb-cloze"])
  })

  it("classifyToolbarButtonIcons: bare ti-bulb alone stays unknown; marker wins", () => {
    expect(classifyToolbarButtonIcons(["ti-bulb"])).toEqual({ kind: "unknown" })
    expect(
      classifyToolbarButtonIcons(["ti-bulb", IR_TOOLBAR_ACTION_MARKER_CLASS.explain])
    ).toEqual({ kind: "action", action: "explain" })
    expect(
      classifyToolbarButtonIcons(["ti-unknown", "ti-bold"])
    ).toEqual({ kind: "format", group: "basicFormat" })
  })

  it("visibility: outside IR always true; unknown always true", () => {
    const settings = getDefaultIRSelectionToolbarSettings()
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "format", group: "basicFormat" },
        settings,
        cardType: "topic",
        inIRScope: false,
        inCurrentCardBody: true
      })
    ).toBe(true)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "unknown" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(true)
  })

  it("visibility: Topic allows extract never cloze; Extract reverse", () => {
    const settings = getDefaultIRSelectionToolbarSettings()
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "extract" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(true)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "cloze" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(false)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "extract" },
        settings,
        cardType: "extract",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(false)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "cloze" },
        settings,
        cardType: "extract",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(true)
  })

  it("visibility: current-card-only ban hides extract/cloze/explain outside body", () => {
    const settings = getDefaultIRSelectionToolbarSettings()
    for (const action of ["extract", "cloze", "explain"] as const) {
      expect(
        resolveToolbarButtonVisibility({
          classification: { kind: "action", action },
          settings,
          cardType: "extract",
          inIRScope: true,
          inCurrentCardBody: false
        })
      ).toBe(false)
    }
    // AI / TTS 仍只看开关（默认关）
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "aiMenu" },
        settings,
        cardType: "extract",
        inIRScope: true,
        inCurrentCardBody: false
      })
    ).toBe(false)
    const withAi = {
      ...settings,
      actions: { ...settings.actions, aiMenu: true, tts: true }
    }
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "aiMenu" },
        settings: withAi,
        cardType: "extract",
        inIRScope: true,
        inCurrentCardBody: false
      })
    ).toBe(true)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "format", group: "basicFormat" },
        settings: {
          ...settings,
          formatGroups: { ...settings.formatGroups, basicFormat: true }
        },
        cardType: "extract",
        inIRScope: true,
        inCurrentCardBody: false
      })
    ).toBe(true)
  })

  it("visibility: disabled format groups and action toggles hide", () => {
    const settings = getDefaultIRSelectionToolbarSettings()
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "format", group: "basicFormat" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(false)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "aiMenu" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(false)
    expect(
      resolveToolbarButtonVisibility({
        classification: { kind: "action", action: "explain" },
        settings,
        cardType: "topic",
        inIRScope: true,
        inCurrentCardBody: true
      })
    ).toBe(true)
  })

  it("listHiddenIconTokensForContext uses markers for actions", () => {
    const settings = getDefaultIRSelectionToolbarSettings()
    const topicHidden = listHiddenIconTokensForContext(settings, "topic")
    expect(topicHidden).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.cloze)
    expect(topicHidden).not.toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.extract)
    expect(topicHidden).not.toContain(IR_TOOLBAR_ACTION_TABLER_ICON.cloze)
    expect(topicHidden).toContain("ti-bold")
    expect(topicHidden).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu)

    const extractHidden = listHiddenIconTokensForContext(settings, "extract")
    expect(extractHidden).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.extract)
    expect(extractHidden).not.toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.cloze)

    const notBody = listHiddenIconTokensForContext(settings, "extract", {
      inCurrentCardBody: false
    })
    expect(notBody).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.extract)
    expect(notBody).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.cloze)
    expect(notBody).toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.explain)
  })

  it("buildIRSelectionToolbarHideCss uses unique markers for actions", () => {
    const css = buildIRSelectionToolbarHideCss(
      getDefaultIRSelectionToolbarSettings()
    )
    expect(css).toContain("html.ir-stb-scope")
    expect(css).toContain("data-ir-stb-card=\"topic\"")
    expect(css).toContain("data-ir-stb-card=\"extract\"")
    expect(css).toContain("data-ir-stb-current-body")
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.cloze}`)
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.extract}`)
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.explain}`)
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu}`)
    // 不得用裸 Tabler 过滤动作（避免误伤其它插件）
    expect(css).not.toContain(`.${IR_TOOLBAR_ACTION_TABLER_ICON.cloze}`)
    expect(css).not.toContain(`.${IR_TOOLBAR_ACTION_TABLER_ICON.explain}`)
    expect(css).not.toContain(`.${IR_TOOLBAR_ACTION_TABLER_ICON.extract}`)
    expect(css).toContain(".ti-bold")
  })

  it("buildIROnlyToolbarBaseHideCss scopes IR-only markers outside scope", () => {
    const css = buildIROnlyToolbarBaseHideCss()
    expect(css).toContain("html:not(.ir-stb-scope)")
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.extract}`)
    expect(css).toContain(`.${IR_TOOLBAR_ACTION_MARKER_CLASS.explain}`)
    // 不得隐藏既有 Cloze/TTS/AI
    expect(css).not.toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.cloze)
    expect(css).not.toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.tts)
    expect(css).not.toContain(IR_TOOLBAR_ACTION_MARKER_CLASS.aiMenu)
    // 必须用唯一 marker，不用裸 ti-bulb
    expect(css).not.toContain(".ti-bulb")
    expect(css).not.toContain(".ti-scissors")
  })
})
