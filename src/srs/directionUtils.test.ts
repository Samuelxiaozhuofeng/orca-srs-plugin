/**
 * directionUtils.ts 方向解析/白名单校验测试
 *
 * 覆盖（对应 improvements/低危问题.md 第 23 条）：
 * 1. extractDirectionInfo 对持久化 fragment 里 direction 值的白名单校验：
 *    合法值透传；缺失（falsy）沿用既有静默回退 "forward"；
 *    契约外脏值 console.warn 后回退 "forward"
 * 2. getDirectionList 作为属性名构建入口的硬门禁：
 *    仅输出 "forward"/"backward"；脏值 warn 后返回 []，
 *    绝不让 srs.<garbage>.* 进入属性写入（AGENTS.md 命名空间硬规则）
 * 3. cycleDirection 的循环与未知值自愈行为
 */

import { describe, expect, it, vi } from "vitest"

import type { ContentFragment } from "../orca.d.ts"
import {
  cycleDirection,
  extractDirectionInfo,
  getDirectionList,
  type DirectionType,
} from "./directionUtils"

const PLUGIN_NAME = "orca-srs"

/** 构造含方向 fragment 的块内容（direction 传 undefined 表示 fragment 缺失该字段） */
const makeContent = (direction: unknown): ContentFragment[] =>
  [
    { t: "t", v: "苹果 " },
    {
      t: `${PLUGIN_NAME}.direction`,
      v: "→",
      ...(direction === undefined ? {} : { direction }),
    },
    { t: "t", v: " apple" },
  ] as unknown as ContentFragment[]

describe("extractDirectionInfo", () => {
  it("合法方向值透传，左右文本正确切分", () => {
    for (const dir of ["forward", "backward", "bidirectional"] as const) {
      const info = extractDirectionInfo(makeContent(dir), PLUGIN_NAME)
      expect(info).not.toBeNull()
      expect(info!.direction).toBe(dir)
      expect(info!.leftText).toBe("苹果")
      expect(info!.rightText).toBe("apple")
    }
  })

  it("无内容或无方向 fragment 时返回 null", () => {
    expect(extractDirectionInfo(undefined, PLUGIN_NAME)).toBeNull()
    expect(extractDirectionInfo([], PLUGIN_NAME)).toBeNull()
    expect(
      extractDirectionInfo(
        [{ t: "t", v: "纯文本" }] as unknown as ContentFragment[],
        PLUGIN_NAME
      )
    ).toBeNull()
  })

  it("direction 缺失/为空串时静默回退 forward（既有行为），不 warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const missing = extractDirectionInfo(makeContent(undefined), PLUGIN_NAME)
      expect(missing!.direction).toBe("forward")

      const empty = extractDirectionInfo(makeContent(""), PLUGIN_NAME)
      expect(empty!.direction).toBe("forward")

      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("契约外脏值（garbage 字符串 / 大小写变体 / 非字符串）warn 后回退 forward", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const garbage = extractDirectionInfo(makeContent("sideways"), PLUGIN_NAME)
      expect(garbage!.direction).toBe("forward")
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain("sideways")

      // 白名单大小写敏感：契约属性名是小写字面量
      const cased = extractDirectionInfo(makeContent("Forward"), PLUGIN_NAME)
      expect(cased!.direction).toBe("forward")
      expect(warnSpy).toHaveBeenCalledTimes(2)

      // 非字符串真值（同步/导入损坏）同样回退
      const nonString = extractDirectionInfo(makeContent(42), PLUGIN_NAME)
      expect(nonString!.direction).toBe("forward")
      expect(warnSpy).toHaveBeenCalledTimes(3)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("getDirectionList（属性名构建的硬门禁）", () => {
  it("合法值：forward/backward 返回自身，bidirectional 展开为两个方向", () => {
    expect(getDirectionList("forward")).toEqual(["forward"])
    expect(getDirectionList("backward")).toEqual(["backward"])
    expect(getDirectionList("bidirectional")).toEqual(["forward", "backward"])
  })

  it("脏值 warn 后返回 []，绝不输出可进入 srs.<garbage>.* 属性名的值", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const dirty = ["garbage", "FORWARD", "", 7, null] as unknown[]
      for (const value of dirty) {
        expect(getDirectionList(value as DirectionType)).toEqual([])
      }
      expect(warnSpy).toHaveBeenCalledTimes(dirty.length)
      expect(warnSpy.mock.calls[0][0]).toContain("garbage")
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("cycleDirection", () => {
  it("按 forward → backward → bidirectional → forward 循环；未知值自愈为 forward", () => {
    expect(cycleDirection("forward")).toBe("backward")
    expect(cycleDirection("backward")).toBe("bidirectional")
    expect(cycleDirection("bidirectional")).toBe("forward")
    // indexOf === -1 时 (idx+1)%3 === 0 → 自愈回 forward（既有行为锁定）
    expect(cycleDirection("junk" as DirectionType)).toBe("forward")
  })
})
