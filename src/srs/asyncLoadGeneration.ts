/**
 * 异步加载 generation gate（F2-01 review 修补）
 *
 * 用于 Renderer 等场景：同一组件上快速切换 blockId / 重试时，
 * 仅最新 generation 可提交结果；旧 in-flight await 不得写状态。
 *
 * 纯逻辑，可单测 latest-wins，不依赖 React。
 */

export type LoadCommitDecision = "commit" | "stale"

/**
 * 单调递增 generation 门闩。
 * - begin()：启动新加载，返回该次 generation
 * - isCurrent(g)：仅当 g 仍是最新时为 true
 * - invalidate()：使所有已发出 generation 失效（effect cleanup）
 */
export type LoadGenerationGate = {
  readonly current: number
  begin(): number
  isCurrent(generation: number): boolean
  invalidate(): void
}

export function createLoadGenerationGate(
  initial: number = 0
): LoadGenerationGate {
  let current = initial
  return {
    get current() {
      return current
    },
    begin() {
      current += 1
      return current
    },
    isCurrent(generation: number) {
      return generation === current
    },
    invalidate() {
      current += 1
    }
  }
}

/**
 * 是否允许提交本次异步结果。
 * generation 必须与 gate 当前值相等。
 */
export function decideLoadCommit(
  generation: number,
  activeGeneration: number
): LoadCommitDecision {
  return generation === activeGeneration ? "commit" : "stale"
}

/**
 * 模拟多路并发加载的 pure helper（测试与文档用）。
 * 按完成顺序依次尝试提交；仅当完成时 generation 仍为最新才 commit。
 *
 * @param startOrder - 启动顺序的 generation 列表（先 start 的在前）
 * @param completeOrder - 完成顺序的 generation 列表
 * @returns 每个完成事件的 decision，以及最终应保留的 generation（若无人 commit 则为 null）
 */
export function simulateConcurrentLoadCommits(
  startOrder: readonly number[],
  completeOrder: readonly number[]
): {
  decisions: ReadonlyArray<{ generation: number; decision: LoadCommitDecision }>
  committedGeneration: number | null
} {
  if (startOrder.length === 0) {
    return { decisions: [], committedGeneration: null }
  }
  // active = 最后一次 begin 的 generation
  const activeAtEnd = startOrder[startOrder.length - 1]
  // 在「全部已 start」前提下按完成序判定（与 Renderer：后 start 的 gen 更大 一致）
  const decisions = completeOrder.map((generation) => ({
    generation,
    decision: decideLoadCommit(generation, activeAtEnd)
  }))
  const committed = [...completeOrder]
    .reverse()
    .find((g) => decideLoadCommit(g, activeAtEnd) === "commit")
  return {
    decisions,
    committedGeneration: committed ?? null
  }
}
