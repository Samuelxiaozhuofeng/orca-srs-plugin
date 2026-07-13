/**
 * 复习会话动作同步门闩（F2-05）
 *
 * 解决 React `setIsGrading(true)` 异步 state 无法挡住同 tick 双击 /
 * 键盘自动重复 / grade 与 postpone·suspend 交叉触发的问题。
 *
 * 职责分工（不得互相替代）：
 * - **本模块 `reviewSessionActionGate`**：会话层持久化/推进动作
 *   （正式评分、repeat 评分、List 辅助预览评分、推迟、暂停）以及
 *   成功后 250ms 切卡 timer。一次只允许一个 in-flight 动作；token
 *   与稳定 cardKey 绑定。
 * - **`choiceSubmitGate`**：选择题答案提交（单选 150ms 延迟 / 多选 Enter），
 *   只防止 choice 答案与统计重复提交，不替代本 gate，也不写 FSRS。
 *
 * `isGrading` 仅用于 UI/快捷键禁用展示，不得承担并发正确性。
 *
 * 纯逻辑、无 React 依赖；组件用 ref 持有可变 gate 实例。
 */

/** 会推进会话 / 写状态的动作种类 */
export type SessionActionKind =
  | "grade"
  | "repeat_grade"
  | "auxiliary_grade"
  | "postpone"
  | "suspend"

/**
 * 不可伪造的动作令牌：id 单调唯一，且绑定获取时的 cardKey / actionKind。
 * 外部只能通过 acquire 获得；校验走 gate.isValid。
 */
export type SessionActionToken = {
  readonly id: number
  readonly cardKey: string
  readonly actionKind: SessionActionKind
}

export type AdvanceCommitDecision = "advance" | "stale"

type HeldAction = {
  tokenId: number
  cardKey: string
  actionKind: SessionActionKind
}

/**
 * 会话动作 gate 可变状态机（单会话一份，通常放在 useRef）。
 */
export type ReviewSessionActionGate = {
  /** 当前是否持有动作锁（同步可读） */
  readonly locked: boolean
  /** 当前绑定的卡片身份；null = 尚未绑定或会话无当前卡 */
  readonly boundCardKey: string | null
  /** 当前持有 token 的 id；未锁定为 null */
  readonly heldTokenId: number | null
  /** 当前持有的动作种类；未锁定为 null */
  readonly heldActionKind: SessionActionKind | null

  /**
   * 绑定/切换当前卡片身份。
   * - 身份变化时：作废旧 token、释放锁，使旧 Promise/timer 全部失效。
   * - 同一 cardKey 重复调用：不改变锁（避免 effect 重跑误清 in-flight）。
   * - cardKey=null：清空绑定并作废（无卡 / 卸载前）。
   */
  bindCard(cardKey: string | null): void

  /**
   * 同步获取会话动作锁。同 tick 第二次、交叉动作、卡不一致均返回 null。
   * 成功返回单调唯一 token。
   */
  acquire(
    cardKey: string,
    actionKind: SessionActionKind
  ): SessionActionToken | null

  /** token 是否仍属于当前持有锁且 cardKey 仍绑定 */
  isValid(token: SessionActionToken): boolean

  /**
   * 失败路径显式释放，允许用户对同一卡重试。
   * 仅当 token 仍有效时成功；成功后 locked=false。
   */
  release(token: SessionActionToken): boolean

  /**
   * 成功路径：校验后同步作废 token 并释放锁（在真正切卡前一刻调用）。
   * 250ms 动画窗口内应仍持有锁；本方法在 timer 回调里、setIndex 之前调用。
   */
  complete(token: SessionActionToken): boolean

  /**
   * 无条件作废当前 token 并释放锁（返回上一张、跳过、只读继续、
   * 队列自动剔除导致身份变化、组件卸载、清理 250ms timer 等）。
   */
  invalidate(): void
}

/**
 * 创建会话动作 gate。
 * seq 从 0 起，第一次 acquire 的 token.id 为 1。
 */
export function createReviewSessionActionGate(): ReviewSessionActionGate {
  let seq = 0
  let boundCardKey: string | null = null
  let held: HeldAction | null = null

  const isValidInternal = (token: SessionActionToken): boolean => {
    return (
      held !== null &&
      held.tokenId === token.id &&
      held.cardKey === token.cardKey &&
      held.actionKind === token.actionKind &&
      boundCardKey === token.cardKey
    )
  }

  return {
    get locked() {
      return held !== null
    },
    get boundCardKey() {
      return boundCardKey
    },
    get heldTokenId() {
      return held?.tokenId ?? null
    },
    get heldActionKind() {
      return held?.actionKind ?? null
    },

    bindCard(cardKey: string | null) {
      if (cardKey === boundCardKey) {
        return
      }
      // 身份变化时作废旧 token；首次从 null 绑定无需抬 seq
      if (boundCardKey !== null || held !== null) {
        seq += 1
      }
      held = null
      boundCardKey = cardKey
    },

    acquire(cardKey: string, actionKind: SessionActionKind) {
      if (!cardKey) return null
      if (held !== null) return null
      // 已绑定其他卡时拒绝（须先 bindCard 或由调用方保证一致）
      if (boundCardKey !== null && boundCardKey !== cardKey) return null

      const tokenId = ++seq
      boundCardKey = cardKey
      held = { tokenId, cardKey, actionKind }
      return { id: tokenId, cardKey, actionKind }
    },

    isValid(token: SessionActionToken) {
      return isValidInternal(token)
    },

    release(token: SessionActionToken) {
      if (!isValidInternal(token)) return false
      held = null
      return true
    },

    complete(token: SessionActionToken) {
      if (!isValidInternal(token)) return false
      // 作废 token：抬高 seq，防止任何持有旧 id 的引用被误判
      seq += 1
      held = null
      return true
    },

    invalidate() {
      seq += 1
      held = null
    }
  }
}

/**
 * 延迟切卡 timer 触发前：仅当 token 仍有效才允许推进。
 * 失效后应安静停止，不得 setIndex / 写新卡 UI。
 */
export function decideAdvanceAfterDelay(
  gate: ReviewSessionActionGate,
  token: SessionActionToken
): AdvanceCommitDecision {
  return gate.isValid(token) ? "advance" : "stale"
}

/**
 * await 之后是否允许提交会话副作用（history / lastLog / progress / queue / index）。
 * 与 decideAdvanceAfterDelay 同语义，命名强调“持久化提交”场景。
 */
export function canCommitSessionAction(
  gate: ReviewSessionActionGate,
  token: SessionActionToken
): boolean {
  return gate.isValid(token)
}

/**
 * 模拟：同卡同 tick 连续 acquire 多次，仅第一次成功。
 * （测试与文档用 pure helper）
 */
export function simulateSameTickAcquires(
  gate: ReviewSessionActionGate,
  cardKey: string,
  kinds: readonly SessionActionKind[]
): Array<SessionActionToken | null> {
  return kinds.map((kind) => gate.acquire(cardKey, kind))
}
