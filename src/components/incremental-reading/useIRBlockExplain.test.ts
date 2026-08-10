/**
 * @vitest-environment jsdom
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { DbId } from "../../orca.d.ts"
import type { IRBlockExplainInlineProps } from "./IRBlockExplainInline"

const {
  generateBlockExplanationMock,
  generateBlockFollowUpMock,
  generateBlockSideContentMock,
  readBlockTextMock
} = vi.hoisted(() => ({
  generateBlockExplanationMock: vi.fn(),
  generateBlockFollowUpMock: vi.fn(),
  generateBlockSideContentMock: vi.fn(),
  readBlockTextMock: vi.fn()
}))

vi.mock("../../srs/ai/aiBlockExplain", () => ({
  generateBlockExplanation: generateBlockExplanationMock,
  generateBlockFollowUp: generateBlockFollowUpMock,
  generateBlockSideContent: generateBlockSideContentMock
}))

vi.mock("../../srs/ai/aiBlockExplainWrite", () => ({
  appendPlainChildIfNew: vi.fn(),
  normalizeChildText: (text: string) => text.replace(/\s+/g, " ").trim()
}))

vi.mock("../../srs/ai/aiSettingsSchema", () => ({
  isAIConfigured: () => true
}))

vi.mock("../../srs/ai/aiFlashcardFlow", () => ({
  readBlockText: readBlockTextMock
}))

type Effect = () => void | (() => void)

type HookSlot<T> = {
  value: T
  deps: readonly unknown[]
}

type EffectSlot = {
  deps: readonly unknown[] | undefined
  cleanup?: () => void
}

type RenderedElement = {
  type: unknown
  props: Record<string, unknown>
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

let useIRBlockExplain: typeof import("./useIRBlockExplain").useIRBlockExplain
let explainRequestEvent: string
let stateSlots: unknown[] = []
let refSlots: Array<{ current: unknown }> = []
let callbackSlots: Array<HookSlot<unknown>> = []
let effectSlots: EffectSlot[] = []
let pendingEffects: Array<{
  index: number
  effect: Effect
  deps: readonly unknown[] | undefined
}> = []
let stateCursor = 0
let refCursor = 0
let callbackCursor = 0
let effectCursor = 0
let latestPanelProps: IRBlockExplainInlineProps | null = null
let selectionValue: Selection | null = null
let getSelectionSpy: ReturnType<typeof vi.spyOn>
let body: HTMLDivElement
let bodyRef: { current: HTMLDivElement | null }

function depsEqual(
  left: readonly unknown[] | undefined,
  right: readonly unknown[] | undefined
): boolean {
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false
  }
  return left.every((value, index) => Object.is(value, right[index]))
}

function useStateStub<T>(
  initial: T | (() => T)
): [T, (value: T | ((previous: T) => T)) => void] {
  const index = stateCursor++
  if (index >= stateSlots.length) {
    stateSlots[index] = typeof initial === "function"
      ? (initial as () => T)()
      : initial
  }
  const setValue = (value: T | ((previous: T) => T)) => {
    const previous = stateSlots[index] as T
    stateSlots[index] = typeof value === "function"
      ? (value as (current: T) => T)(previous)
      : value
  }
  return [stateSlots[index] as T, setValue]
}

function useRefStub<T>(initial: T): { current: T } {
  const index = refCursor++
  if (index >= refSlots.length) refSlots[index] = { current: initial }
  return refSlots[index] as { current: T }
}

function useCallbackStub<T>(callback: T, deps: readonly unknown[]): T {
  const index = callbackCursor++
  const previous = callbackSlots[index] as HookSlot<T> | undefined
  if (previous && depsEqual(previous.deps, deps)) return previous.value
  callbackSlots[index] = { value: callback, deps }
  return callback
}

function useEffectStub(effect: Effect, deps?: readonly unknown[]): void {
  const index = effectCursor++
  const previous = effectSlots[index]
  if (previous && depsEqual(previous.deps, deps)) return
  pendingEffects.push({ index, effect, deps })
}

function createElementStub(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): RenderedElement {
  return {
    type,
    props: {
      ...(props ?? {}),
      ...(children.length > 0
        ? { children: children.length === 1 ? children[0] : children }
        : {})
    }
  }
}

function flushEffects(): void {
  const effects = pendingEffects
  pendingEffects = []
  for (const pending of effects) {
    effectSlots[pending.index]?.cleanup?.()
    const cleanup = pending.effect()
    effectSlots[pending.index] = {
      deps: pending.deps,
      cleanup: typeof cleanup === "function" ? cleanup : undefined
    }
  }
}

function renderHook(): void {
  stateCursor = 0
  refCursor = 0
  callbackCursor = 0
  effectCursor = 0
  pendingEffects = []
  useIRBlockExplain({
    enabled: true,
    pluginName: "orca-srs",
    cardId: 99 as DbId,
    bodyRef,
    Panel: () => null
  })
  flushEffects()
}

function cleanupHook(): void {
  for (let index = effectSlots.length - 1; index >= 0; index--) {
    effectSlots[index]?.cleanup?.()
  }
  effectSlots = []
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function blockTextNode(blockId: number): Text {
  const node = body.querySelector<HTMLElement>(
    `.orca-block[data-id="${blockId}"] .block-text`
  )?.firstChild
  if (!(node instanceof Text)) throw new Error(`Missing text node for block ${blockId}`)
  return node
}

function setSelection(
  anchorNode: Node,
  focusNode: Node,
  text: string,
  isCollapsed = false
): void {
  selectionValue = {
    anchorNode,
    focusNode,
    isCollapsed,
    toString: () => text
  } as Selection
}

async function openReadyExplanation(focusText: string | null = null): Promise<void> {
  const textNode = blockTextNode(1)
  setSelection(textNode, textNode, focusText ?? "", focusText == null)
  const trigger = body.querySelector<HTMLButtonElement>(
    '.orca-block[data-id="1"] .ir-block-explain-trigger'
  )
  if (!trigger) throw new Error("Missing explain trigger")
  trigger.click()
  await flushAsync()
  renderHook()
  expect(latestPanelProps?.status).toBe("ready")
}

async function runSideSwitch(first: "example" | "rebuttal"): Promise<{
  exampleSignal: AbortSignal
  rebuttalSignal: AbortSignal
}> {
  const example = deferred<{ success: true; text: string }>()
  const rebuttal = deferred<{ success: true; text: string }>()
  generateBlockSideContentMock.mockImplementation(
    ({ mode }: { mode: "example" | "rebuttal" }) =>
      mode === "example" ? example.promise : rebuttal.promise
  )

  await openReadyExplanation()
  const second = first === "example" ? "rebuttal" : "example"

  const firstHandler = first === "example"
    ? latestPanelProps!.onExample
    : latestPanelProps!.onRebuttal
  firstHandler()
  renderHook()

  const secondHandler = second === "example"
    ? latestPanelProps!.onExample
    : latestPanelProps!.onRebuttal
  secondHandler()
  renderHook()

  const exampleCall = generateBlockSideContentMock.mock.calls.find(
    ([options]) => options.mode === "example"
  )
  const rebuttalCall = generateBlockSideContentMock.mock.calls.find(
    ([options]) => options.mode === "rebuttal"
  )
  if (!exampleCall || !rebuttalCall) throw new Error("Missing side requests")
  const exampleSignal = exampleCall[0].signal as AbortSignal
  const rebuttalSignal = rebuttalCall[0].signal as AbortSignal

  expect(exampleSignal.aborted).toBe(false)
  expect(rebuttalSignal.aborted).toBe(false)
  expect(latestPanelProps?.example.status).toBe("loading")
  expect(latestPanelProps?.rebuttal.status).toBe("loading")

  if (first === "example") {
    rebuttal.resolve({ success: true, text: "反驳结果" })
    example.resolve({ success: true, text: "举例结果" })
  } else {
    example.resolve({ success: true, text: "举例结果" })
    rebuttal.resolve({ success: true, text: "反驳结果" })
  }
  await flushAsync()
  renderHook()

  return { exampleSignal, rebuttalSignal }
}

beforeAll(async () => {
  Object.assign(window, {
    React: {
      useCallback: useCallbackStub,
      useEffect: useEffectStub,
      useRef: useRefStub,
      useState: useStateStub,
      createElement: createElementStub
    },
    createRoot: () => ({
      render: (node: RenderedElement) => {
        latestPanelProps = node.props as unknown as IRBlockExplainInlineProps
      },
      unmount: () => {
        latestPanelProps = null
      }
    })
  })
  const module = await import("./useIRBlockExplain")
  useIRBlockExplain = module.useIRBlockExplain
  explainRequestEvent = module.IR_BLOCK_EXPLAIN_REQUEST_EVENT
})

beforeEach(() => {
  stateSlots = []
  refSlots = []
  callbackSlots = []
  effectSlots = []
  pendingEffects = []
  latestPanelProps = null
  selectionValue = null

  document.body.innerHTML = `
    <div id="body">
      <div class="orca-block" data-id="1">
        <span class="block-text">第一块</span><span class="block-text-later">文字</span>
      </div>
      <div class="orca-block" data-id="2"><span class="block-text">第二块文字</span></div>
    </div>
  `
  body = document.querySelector<HTMLDivElement>("#body")!
  bodyRef = { current: body }

  getSelectionSpy = vi.spyOn(window, "getSelection").mockImplementation(
    () => selectionValue
  )
  vi.stubGlobal("orca", { notify: vi.fn() })

  generateBlockExplanationMock.mockReset().mockResolvedValue({
    success: true,
    explanation: {
      paraphrase: "白话解释",
      terms: [],
      role: "",
      selfCheck: null
    }
  })
  generateBlockFollowUpMock.mockReset()
  generateBlockSideContentMock.mockReset()
  readBlockTextMock.mockReset().mockResolvedValue({
    text: "第一块文字",
    block: null
  })

  renderHook()
})

afterEach(() => {
  cleanupHook()
  getSelectionSpy.mockRestore()
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("useIRBlockExplain", () => {
  it("举例→反驳快速切换时两侧请求互不取消且都离开 loading", async () => {
    const { exampleSignal, rebuttalSignal } = await runSideSwitch("example")

    expect(exampleSignal.aborted).toBe(false)
    expect(rebuttalSignal.aborted).toBe(false)
    expect(latestPanelProps?.example).toMatchObject({
      status: "ready",
      text: "举例结果"
    })
    expect(latestPanelProps?.rebuttal).toMatchObject({
      status: "ready",
      text: "反驳结果"
    })
  })

  it("反驳→举例快速切换时两侧请求互不取消且都离开 loading", async () => {
    const { exampleSignal, rebuttalSignal } = await runSideSwitch("rebuttal")

    expect(exampleSignal.aborted).toBe(false)
    expect(rebuttalSignal.aborted).toBe(false)
    expect(latestPanelProps?.example).toMatchObject({
      status: "ready",
      text: "举例结果"
    })
    expect(latestPanelProps?.rebuttal).toMatchObject({
      status: "ready",
      text: "反驳结果"
    })
  })

  it("跨块选区显示明确提示且不发起解释", () => {
    setSelection(blockTextNode(1), blockTextNode(2), "跨块文字")
    const event = new Event(explainRequestEvent, { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(orca.notify).toHaveBeenCalledWith(
      "warn",
      "块解释只支持单块内选区，请重新选择",
      { title: "块解释" }
    )
    expect(readBlockTextMock).not.toHaveBeenCalled()
    expect(generateBlockExplanationMock).not.toHaveBeenCalled()
  })

  it("同块内反向 anchor/focus 仍把选中文字作为 FOCUS", async () => {
    const earlierTextNode = blockTextNode(1)
    const laterTextNode = body.querySelector<HTMLElement>(
      '.orca-block[data-id="1"] .block-text-later'
    )?.firstChild
    if (!(laterTextNode instanceof Text)) throw new Error("Missing later text node")
    setSelection(laterTextNode, earlierTextNode, "块内反向选区")
    body.querySelector<HTMLButtonElement>(
      '.orca-block[data-id="1"] .ir-block-explain-trigger'
    )!.click()
    await flushAsync()

    expect(generateBlockExplanationMock).toHaveBeenCalledWith(
      expect.objectContaining({ focusText: "块内反向选区" })
    )
    expect(orca.notify).not.toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("只支持单块内选区"),
      expect.anything()
    )
  })
})
