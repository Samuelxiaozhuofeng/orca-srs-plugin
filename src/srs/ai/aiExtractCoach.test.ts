/**
 * Extract 处理建议（aiExtractCoach）单元测试。
 * 纯逻辑、DOM-free：mock orca + fetch，覆盖上下文有界收集、prompt 边界、
 * JSON 解析校验、接地校验、会话缓存、隐藏、generation token 防覆盖与请求日志归类。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Block } from "../../orca.d.ts"
import {
  acceptResultIfCurrent,
  buildExtractCoachCacheKey,
  buildExtractCoachMessages,
  clearExtractCoachCache,
  clearExtractCoachHidden,
  collectExtractCoachContext,
  EXTRACT_COACH_BLOCK_MAX_CHARS,
  EXTRACT_COACH_CACHE_MAX,
  EXTRACT_COACH_CONTEXT_MAX_BLOCKS,
  EXTRACT_COACH_CONTEXT_MAX_CHARS,
  ExtractCoachContextError,
  generateExtractCoachSuggestion,
  getCachedExtractCoachSuggestion,
  hideExtractCoach,
  isExtractCoachHidden,
  parseExtractCoachSuggestion,
  setCachedExtractCoachSuggestion
} from "./aiExtractCoach"
import { clearAiRequestLog, getAiRequestLog } from "./aiRequestLog"
import { createRequestTokenGuard } from "./aiRequestToken"

const PLUGIN = "test-plugin"
const MODIFIED = new Date("2026-01-01T00:00:00Z")

function makeBlock(
  partial: Partial<Block> & { id: number; text?: string }
): Block {
  return {
    id: partial.id,
    text: partial.text ?? "",
    parent: partial.parent,
    left: partial.left,
    children: partial.children ?? [],
    modified: partial.modified ?? MODIFIED,
    created: partial.created ?? MODIFIED,
    aliases: partial.aliases ?? [],
    properties: partial.properties ?? [],
    refs: partial.refs ?? [],
    backRefs: partial.backRefs ?? []
  } as Block
}

/** 组装一棵「摘录 → 父块 → 兄弟 → Topic → 直接子块」测试树。 */
function buildFixture(): { state: Record<string, Block>; backend: Record<string, Block> } {
  const blocks = {
    100: makeBlock({ id: 100, text: "摘录正文内容", parent: 200, children: [301, 302, 303, 304] }),
    200: makeBlock({ id: 200, text: "父块原文", parent: 400, left: 201, children: [100] }),
    400: makeBlock({ id: 400, text: "祖块", children: [201, 200, 202] }),
    201: makeBlock({ id: 201, text: "前一兄弟块", parent: 400 }),
    202: makeBlock({ id: 202, text: "后一兄弟块", parent: 400 }),
    500: makeBlock({ id: 500, text: "Topic 标题" }),
    301: makeBlock({ id: 301, text: "直接子块 1", parent: 100 }),
    302: makeBlock({ id: 302, text: "直接子块 2", parent: 100 }),
    303: makeBlock({ id: 303, text: "直接子块 3", parent: 100 }),
    304: makeBlock({ id: 304, text: "直接子块 4", parent: 100 })
  }
  return { state: { ...blocks }, backend: { ...blocks } }
}

function setupOrca(opts?: {
  state?: Record<string, Block>
  backend?: Record<string, Block>
  apiKey?: string
  failBackend?: boolean
}): { invokeBackend: ReturnType<typeof vi.fn> } {
  const backend = new Map<number, Block>()
  for (const [k, v] of Object.entries(opts?.backend ?? {})) {
    if (v != null) backend.set(Number(k), v)
  }
  const invokeBackend = vi.fn(async (type: string, ...args: unknown[]) => {
    if (opts?.failBackend) throw new Error("backend boom")
    if (type === "get-block") {
      return backend.get(Number(args[0])) ?? null
    }
    if (type === "get-blocks") {
      const ids = args[0] as number[]
      return ids.map((id) => backend.get(Number(id))).filter(Boolean)
    }
    throw new Error(`unexpected backend call: ${type}`)
  })
  ;(globalThis as { orca?: unknown }).orca = {
    state: {
      plugins: {
        [PLUGIN]: {
          settings: {
            "ai.apiKey": opts?.apiKey ?? "test-key",
            "ai.apiUrl": "https://example.test/v1/chat/completions",
            "ai.model": "test-model"
          }
        }
      },
      blocks: opts?.state ?? {}
    },
    invokeBackend
  }
  return { invokeBackend }
}

function makeFetchMock(content: string): ReturnType<typeof vi.fn> {
  const payload = JSON.stringify({
    choices: [{ message: { content } }]
  })
  return vi.fn(async () =>
    new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(payload).byteLength)
      }
    })
  )
}

const VALID_RAW = JSON.stringify({
  insight: "这是核心价值",
  actions: [
    {
      kind: "cloze",
      title: "挖空关键词",
      detail: "把关键概念挖空复习",
      quote: "摘录正文内容"
    },
    { kind: "question", title: "提问", detail: "自己提问作答" }
  ]
})

beforeEach(() => {
  clearExtractCoachCache()
  clearExtractCoachHidden()
  clearAiRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("collectExtractCoachContext 有界上下文", () => {
  it("按 摘录→父块→前兄弟→后兄弟→Topic→直接子块 顺序收集且去重", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })

    expect(context.parts.map((p) => p.role)).toEqual([
      "extract",
      "parent",
      "prev-sibling",
      "next-sibling",
      "topic",
      "child",
      "child",
      "child"
    ])
    expect(context.parts.map((p) => p.blockId)).toEqual([
      100, 200, 201, 202, 500, 301, 302, 303
    ])
    // 第 4 个直接子块被排除（最多 3 个）
    expect(context.parts.some((p) => p.blockId === 304)).toBe(false)
  })

  it("Topic 与既有块重复时去重", async () => {
    const fixture = buildFixture()
    // sourceTopicId 指向父块本身 → topic 分节应被去重
    setupOrca({ ...fixture })
    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 200 })
    expect(context.parts.some((p) => p.role === "topic")).toBe(false)
    expect(context.parts.map((p) => p.blockId)).toEqual([
      100, 200, 201, 202, 301, 302, 303
    ])
  })

  it("读取数量不超过 8 个块", async () => {
    const fixture = buildFixture()
    const { invokeBackend } = setupOrca({ ...fixture })
    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })

    expect(context.parts.length).toBeLessThanOrEqual(EXTRACT_COACH_CONTEXT_MAX_BLOCKS)
    const getBlocksCalls = invokeBackend.mock.calls.filter(([type]) => type === "get-blocks")
    const totalRead = getBlocksCalls.reduce(
      (sum, [, ids]) => sum + (ids as number[]).length,
      0
    )
    expect(totalRead).toBeLessThanOrEqual(EXTRACT_COACH_CONTEXT_MAX_BLOCKS)
  })

  it("发送文本总量 ≤ 8000 字符，单块文本截断到块上限", async () => {
    const fixture = buildFixture()
    const longText = "长".repeat(EXTRACT_COACH_BLOCK_MAX_CHARS + 500)
    fixture.state[100] = makeBlock({ id: 100, text: longText, parent: 200, children: [] })
    fixture.backend[100] = fixture.state[100]
    setupOrca(fixture)

    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })
    expect(context.text.length).toBeLessThanOrEqual(EXTRACT_COACH_CONTEXT_MAX_CHARS)
    const extractPart = context.parts.find((p) => p.role === "extract")
    expect(extractPart?.text.length).toBe(EXTRACT_COACH_BLOCK_MAX_CHARS)
  })

  it("后端读取失败抛出 ExtractCoachContextError，不伪装成空上下文", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture, failBackend: true })
    await expect(
      collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })
    ).rejects.toBeInstanceOf(ExtractCoachContextError)
  })

  it("摘录块不存在时抛出 ExtractCoachContextError", async () => {
    setupOrca({ state: {}, backend: {} })
    await expect(
      collectExtractCoachContext({ cardId: 999, sourceTopicId: undefined })
    ).rejects.toBeInstanceOf(ExtractCoachContextError)
  })
})

describe("buildExtractCoachMessages prompt 边界", () => {
  it("包含不可信数据边界与 BEGIN/END 分隔符", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })
    const [system, user] = buildExtractCoachMessages(context)

    expect(system.content).toContain("不可信数据")
    expect(system.content).toContain("ExtractCoachSuggestion")
    expect(user.content).toContain("-----BEGIN")
    expect(user.content).toContain("-----END")
    expect(user.content).toContain("摘录正文")
    expect(user.content).toContain("不可信数据")
  })

  it("直接子块分节带「勿建议重复加工」提示", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const context = await collectExtractCoachContext({ cardId: 100, sourceTopicId: 500 })
    const [, user] = buildExtractCoachMessages(context)
    expect(user.content).toContain("已有直接子块")
    expect(user.content).toContain("勿建议重复加工")
  })
})

describe("parseExtractCoachSuggestion 解析与校验", () => {
  it("合法 JSON 解析成功", () => {
    const result = parseExtractCoachSuggestion(VALID_RAW, "摘录正文内容")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.insight).toBe("这是核心价值")
    expect(result.suggestion.actions).toHaveLength(2)
  })

  it("畸形 JSON 返回可见解析错误", () => {
    const result = parseExtractCoachSuggestion("{ not json", "摘录正文内容")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("PARSE")
    expect(result.error.message.length).toBeGreaterThan(0)
  })

  it("空响应返回可见解析错误", () => {
    const result = parseExtractCoachSuggestion("", "摘录正文内容")
    expect(result.ok).toBe(false)
  })

  it("insight 为空返回可见错误（空内容）", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({ insight: "   ", actions: [] }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("EMPTY")
  })

  it("未知 kind 返回可见解析错误", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({
        insight: "价值",
        actions: [{ kind: "destroy", title: "t", detail: "d" }]
      }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("PARSE")
  })

  it("actions 为空视为合法的「无需加工」结果", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({ insight: "已足够，可直接继续阅读", actions: [] }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.actions).toEqual([])
  })

  it("actions 缺省时视为空数组（无需加工）", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({ insight: "已足够" }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
  })

  it("cloze.quote 接地时保留", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({
        insight: "v",
        actions: [
          { kind: "cloze", title: "t", detail: "d", quote: "摘录正文内容" }
        ]
      }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.actions[0].quote).toBe("摘录正文内容")
  })

  it("cloze.quote 不接地时丢弃 quote，不得展示为可挖空原文", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({
        insight: "v",
        actions: [
          { kind: "cloze", title: "t", detail: "d", quote: "完全不在正文里的话" }
        ]
      }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.actions[0].quote).toBeUndefined()
  })

  it("title/detail/insight 截断到上限", () => {
    const result = parseExtractCoachSuggestion(
      JSON.stringify({
        insight: "值".repeat(400),
        actions: [
          { kind: "done", title: "题".repeat(120), detail: "细".repeat(400) }
        ]
      }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.insight.length).toBeLessThanOrEqual(300)
    expect(result.suggestion.actions[0].title.length).toBeLessThanOrEqual(80)
    expect(result.suggestion.actions[0].detail.length).toBeLessThanOrEqual(300)
  })

  it("actions 最多 3 条，多余截断", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      kind: "done" as const,
      title: `t${i}`,
      detail: `d${i}`
    }))
    const result = parseExtractCoachSuggestion(
      JSON.stringify({ insight: "v", actions: many }),
      "摘录正文内容"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.actions).toHaveLength(3)
  })
})

describe("generateExtractCoachSuggestion 生成流程", () => {
  it("成功生成并写入请求日志（purpose=extract-coach）", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const fetchMock = makeFetchMock(VALID_RAW)

    const result = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getAiRequestLog()[0]?.purpose).toBe("extract-coach")
  })

  it("缓存命中不重复调用 AI", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const fetchMock = makeFetchMock(VALID_RAW)

    const first = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    const second = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("force 重新生成绕过缓存，且新结果覆盖缓存", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const initialRaw = JSON.stringify({
      insight: "初次建议",
      actions: []
    })
    const regeneratedRaw = JSON.stringify({
      insight: "重新生成后的建议",
      actions: []
    })
    const fetchMock = makeFetchMock(initialRaw)

    const first = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })

    // force 重新生成：换新响应，仍发第二次请求
    fetchMock.mockReturnValue(
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: regeneratedRaw } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )
    const second = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      force: true,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第三次（非 force）应命中「重新生成后」的新缓存，不再发请求
    const third = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const getInsight = (r: Awaited<ReturnType<typeof generateExtractCoachSuggestion>>) =>
      r.ok ? r.suggestion.insight : ""
    expect(getInsight(first)).toBe("初次建议")
    expect(getInsight(second)).toBe("重新生成后的建议")
    expect(getInsight(third)).toBe("重新生成后的建议")
  })

  it("无 API Key 时不发请求并返回 NO_API_KEY", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture, apiKey: "" })
    const fetchMock = makeFetchMock(VALID_RAW)

    const result = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("NO_API_KEY")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("signal 已中止时返回 CANCELLED", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const controller = new AbortController()
    controller.abort()

    const result = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      signal: controller.signal
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("CANCELLED")
  })

  it("上下文读取失败返回 CONTEXT_READ_FAILED（可见错误，可重试）", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture, failBackend: true })

    const result = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("CONTEXT_READ_FAILED")
  })

  it("AI 返回畸形 JSON 时返回可见解析错误", async () => {
    const fixture = buildFixture()
    setupOrca({ ...fixture })
    const fetchMock = makeFetchMock("{ not json")

    const result = await generateExtractCoachSuggestion({
      pluginName: PLUGIN,
      cardId: 100,
      sourceTopicId: 500,
      fetchImpl: fetchMock as unknown as typeof fetch
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("PARSE")
  })
})

describe("会话内缓存与隐藏", () => {
  it("缓存上限 50，超出逐出最旧", () => {
    const key = (i: number) => buildExtractCoachCacheKey(i, 1, "sig")
    for (let i = 0; i < EXTRACT_COACH_CACHE_MAX + 1; i += 1) {
      setCachedExtractCoachSuggestion(key(i), { insight: `v${i}`, actions: [] })
    }
    expect(getCachedExtractCoachSuggestion(key(0))).toBeUndefined()
    expect(
      getCachedExtractCoachSuggestion(key(EXTRACT_COACH_CACHE_MAX))
    ).toBeDefined()
  })

  it("隐藏是会话内、按 Extract 生效", () => {
    expect(isExtractCoachHidden(7)).toBe(false)
    hideExtractCoach(7)
    expect(isExtractCoachHidden(7)).toBe(true)
    expect(isExtractCoachHidden(8)).toBe(false)
    clearExtractCoachHidden()
    expect(isExtractCoachHidden(7)).toBe(false)
  })
})

describe("acceptResultIfCurrent 防旧结果覆盖", () => {
  it("切卡后旧 token 的结果不应用", () => {
    const guard = createRequestTokenGuard()
    const resultA: ReturnType<typeof parseExtractCoachSuggestion> = {
      ok: true,
      suggestion: { insight: "旧卡", actions: [] }
    }
    const tokenA = guard.next()
    guard.invalidate() // 模拟切卡/关闭
    const tokenB = guard.next()

    expect(acceptResultIfCurrent(guard, tokenA, resultA).applied).toBe(false)
    expect(acceptResultIfCurrent(guard, tokenB, resultA).applied).toBe(true)
  })
})
