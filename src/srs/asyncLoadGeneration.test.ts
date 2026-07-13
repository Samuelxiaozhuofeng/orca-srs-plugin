import { describe, expect, it } from "vitest"
import {
  createLoadGenerationGate,
  decideLoadCommit,
  simulateConcurrentLoadCommits
} from "./asyncLoadGeneration"

describe("asyncLoadGeneration", () => {
  describe("createLoadGenerationGate", () => {
    it("begin 单调递增，仅最新 isCurrent", () => {
      const gate = createLoadGenerationGate()
      const g1 = gate.begin()
      const g2 = gate.begin()
      expect(g1).toBe(1)
      expect(g2).toBe(2)
      expect(gate.isCurrent(g1)).toBe(false)
      expect(gate.isCurrent(g2)).toBe(true)
    })

    it("invalidate 使进行中的 generation 失效", () => {
      const gate = createLoadGenerationGate()
      const g1 = gate.begin()
      gate.invalidate()
      expect(gate.isCurrent(g1)).toBe(false)
      const g2 = gate.begin()
      expect(gate.isCurrent(g2)).toBe(true)
    })
  })

  describe("decideLoadCommit / concurrent A then B", () => {
    it("A 先开始、B 后开始、B 先完成、A 后完成 → 只允许 B commit", () => {
      const gate = createLoadGenerationGate()
      const genA = gate.begin()
      const genB = gate.begin()

      // B 先完成
      expect(decideLoadCommit(genB, gate.current)).toBe("commit")
      // A 后完成，不得覆盖
      expect(decideLoadCommit(genA, gate.current)).toBe("stale")

      const sim = simulateConcurrentLoadCommits([genA, genB], [genB, genA])
      expect(sim.committedGeneration).toBe(genB)
      expect(sim.decisions).toEqual([
        { generation: genB, decision: "commit" },
        { generation: genA, decision: "stale" }
      ])
    })

    it("A 先开始、B 后开始、A 先完成（已 stale）、B 后完成 → 只 B commit", () => {
      const gate = createLoadGenerationGate()
      const genA = gate.begin()
      const genB = gate.begin()

      expect(decideLoadCommit(genA, gate.current)).toBe("stale")
      expect(decideLoadCommit(genB, gate.current)).toBe("commit")

      const sim = simulateConcurrentLoadCommits([genA, genB], [genA, genB])
      expect(sim.committedGeneration).toBe(genB)
      expect(sim.decisions[0]).toEqual({
        generation: genA,
        decision: "stale"
      })
      expect(sim.decisions[1]).toEqual({
        generation: genB,
        decision: "commit"
      })
    })

    it("旧 generation 失败不得覆盖新 generation 成功（语义：stale 不 commit）", () => {
      const gate = createLoadGenerationGate()
      const genA = gate.begin()
      const genB = gate.begin()
      // B 成功 commit
      expect(decideLoadCommit(genB, gate.current)).toBe("commit")
      // A 随后失败：仍 stale，调用方不得 setError
      expect(decideLoadCommit(genA, gate.current)).toBe("stale")
    })

    it("retry 同一逻辑：新 generation 替换旧，旧不得 commit", () => {
      const gate = createLoadGenerationGate()
      const first = gate.begin()
      const retry = gate.begin()
      expect(decideLoadCommit(first, gate.current)).toBe("stale")
      expect(decideLoadCommit(retry, gate.current)).toBe("commit")
    })

    it("cleanup invalidate 后旧 load 不得 commit，新 begin 可 commit", () => {
      const gate = createLoadGenerationGate()
      const oldGen = gate.begin()
      gate.invalidate()
      expect(decideLoadCommit(oldGen, gate.current)).toBe("stale")
      const next = gate.begin()
      expect(decideLoadCommit(next, gate.current)).toBe("commit")
    })
  })
})
