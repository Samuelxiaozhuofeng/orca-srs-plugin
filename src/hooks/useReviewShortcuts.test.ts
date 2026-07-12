import { describe, expect, it } from "vitest"
import { resolveReviewShortcut } from "./reviewShortcutRules"

describe("resolveReviewShortcut", () => {
  const base = {
    showAnswer: true,
    isGrading: false,
    enabled: true,
    readOnly: false,
    hasShowAnswer: true,
    hasBury: true,
    hasSuspend: true
  }

  it("正常模式：数字键评分、空格 good、b/s", () => {
    expect(resolveReviewShortcut({ ...base, key: "3" })).toEqual({
      type: "grade",
      grade: "good"
    })
    expect(resolveReviewShortcut({ ...base, key: "1" })).toEqual({
      type: "grade",
      grade: "again"
    })
    expect(resolveReviewShortcut({ ...base, key: " " })).toEqual({
      type: "grade",
      grade: "good"
    })
    expect(resolveReviewShortcut({ ...base, key: "b" })).toEqual({ type: "bury" })
    expect(resolveReviewShortcut({ ...base, key: "s" })).toEqual({
      type: "suspend"
    })
  })

  it("答案未显示时空格显示答案；数字键不评分", () => {
    expect(
      resolveReviewShortcut({ ...base, showAnswer: false, key: " " })
    ).toEqual({ type: "showAnswer" })
    expect(
      resolveReviewShortcut({ ...base, showAnswer: false, key: "3" })
    ).toEqual({ type: "none" })
  })

  it("readOnly：禁止评分、bury、suspend；允许显示答案", () => {
    const ro = { ...base, readOnly: true }
    expect(resolveReviewShortcut({ ...ro, key: "3" })).toEqual({ type: "none" })
    expect(resolveReviewShortcut({ ...ro, key: " " })).toEqual({ type: "none" })
    expect(resolveReviewShortcut({ ...ro, key: "b" })).toEqual({ type: "none" })
    expect(resolveReviewShortcut({ ...ro, key: "s" })).toEqual({ type: "none" })
    expect(
      resolveReviewShortcut({ ...ro, showAnswer: false, key: " " })
    ).toEqual({ type: "showAnswer" })
  })

  it("readOnly 选择题：数字键与 Enter 不得选择/提交", () => {
    const choice = { mode: "multiple" as const, optionCount: 4 }
    const ro = {
      ...base,
      showAnswer: false,
      readOnly: true,
      choiceCard: choice
    }
    expect(resolveReviewShortcut({ ...ro, key: "1" })).toEqual({ type: "none" })
    expect(resolveReviewShortcut({ ...ro, key: "Enter" })).toEqual({
      type: "none"
    })
    expect(resolveReviewShortcut({ ...ro, key: " " })).toEqual({ type: "none" })
  })

  it("正常选择题：数字选择、Enter/空格提交", () => {
    const choice = { mode: "multiple" as const, optionCount: 3 }
    const baseChoice = {
      ...base,
      showAnswer: false,
      choiceCard: choice
    }
    expect(resolveReviewShortcut({ ...baseChoice, key: "2" })).toEqual({
      type: "choiceSelect",
      index: 1
    })
    expect(resolveReviewShortcut({ ...baseChoice, key: "Enter" })).toEqual({
      type: "choiceSubmit"
    })
    expect(resolveReviewShortcut({ ...baseChoice, key: " " })).toEqual({
      type: "choiceSubmit"
    })
  })

  it("isGrading / enabled=false 全部禁用", () => {
    expect(
      resolveReviewShortcut({ ...base, isGrading: true, key: "3" })
    ).toEqual({ type: "none" })
    expect(
      resolveReviewShortcut({ ...base, enabled: false, key: "3" })
    ).toEqual({ type: "none" })
  })
})
