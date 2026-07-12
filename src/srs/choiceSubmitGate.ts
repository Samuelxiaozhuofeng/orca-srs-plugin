/**
 * 选择题提交门闩（FC-06 修补）
 *
 * 解决单选 150ms 延迟提交的竞态：
 * - 快速双击 / 快捷键在 React 重渲染前创建多个 timer
 * - setTimeout 闭包读到过期 readOnly，进入只读或切卡后仍 onAnswer
 *
 * 纯逻辑、无 React 依赖；组件用 ref 持有可变 state。
 */

export type ChoiceSubmitGateState = {
  /** 当前卡片身份（通常 String(blockId)） */
  cardKey: string
  /**
   * 是否已接受一次提交意图（单选 pending 或已揭晓提交）。
   * true 时拒绝后续 begin；同步设置，不依赖 React state 更新。
   */
  locked: boolean
  /** 当前单选延迟提交 token；无 pending 时为 null */
  pendingToken: number | null
  /** 单调递增，用于作废旧 token */
  seq: number
}

export function createChoiceSubmitGate(cardKey: string): ChoiceSubmitGateState {
  return {
    cardKey,
    locked: false,
    pendingToken: null,
    seq: 0
  }
}

export type BeginSubmitContext = {
  cardKey: string
  readOnly: boolean
  /** 答案已揭晓时不可再提交 */
  answerRevealed?: boolean
  isGrading?: boolean
}

/**
 * 尝试开始单选延迟提交。成功则立刻 locked=true 并返回 token。
 * 重复调用 / readOnly / 卡不一致 → token null。
 */
export function tryBeginSingleSubmit(
  state: ChoiceSubmitGateState,
  ctx: BeginSubmitContext
): { state: ChoiceSubmitGateState; token: number | null } {
  if (
    ctx.readOnly ||
    ctx.answerRevealed ||
    ctx.isGrading ||
    state.locked ||
    ctx.cardKey !== state.cardKey
  ) {
    return { state, token: null }
  }
  const token = state.seq + 1
  return {
    state: {
      ...state,
      locked: true,
      pendingToken: token,
      seq: token
    },
    token
  }
}

/**
 * 延迟 timer 触发前校验：同 card、非 readOnly、仍挂载、token 未作废。
 */
export function canFireSingleSubmit(
  state: ChoiceSubmitGateState,
  opts: {
    token: number
    cardKey: string
    readOnly: boolean
    mounted: boolean
  }
): boolean {
  return (
    opts.mounted &&
    !opts.readOnly &&
    opts.cardKey === state.cardKey &&
    state.locked &&
    state.pendingToken === opts.token
  )
}

/** 单选成功提交后清除 pending（保持 locked） */
export function completeSingleSubmit(
  state: ChoiceSubmitGateState,
  token: number
): ChoiceSubmitGateState {
  if (state.pendingToken !== token) return state
  return { ...state, pendingToken: null }
}

/**
 * 尝试多选即时提交。成功则 locked=true。
 * 同一周期内重复 Enter/点击 → 第二次 accepted=false。
 */
export function tryBeginMultiSubmit(
  state: ChoiceSubmitGateState,
  ctx: BeginSubmitContext
): { state: ChoiceSubmitGateState; accepted: boolean } {
  if (
    ctx.readOnly ||
    ctx.answerRevealed ||
    ctx.isGrading ||
    state.locked ||
    ctx.cardKey !== state.cardKey
  ) {
    return { state, accepted: false }
  }
  return {
    state: {
      ...state,
      locked: true,
      pendingToken: null
    },
    accepted: true
  }
}

/**
 * 取消 pending（切卡 / 进只读 / 卸载）。
 * 作废 token；unlock 以便新卡可再提交（切卡应再调 resetGateForCard）。
 */
export function cancelPendingSubmit(
  state: ChoiceSubmitGateState
): ChoiceSubmitGateState {
  return {
    ...state,
    locked: false,
    pendingToken: null,
    seq: state.seq + 1
  }
}

/** 切换到新卡：重置锁与 pending，作废旧 token */
export function resetGateForCard(
  state: ChoiceSubmitGateState,
  cardKey: string
): ChoiceSubmitGateState {
  return {
    cardKey,
    locked: false,
    pendingToken: null,
    seq: state.seq + 1
  }
}

/**
 * 进入只读：作废 pending，保持 locked 防止同卡再提交。
 * （若仅 cancel 会 unlock，理论可在只读误触时再 begin——begin 虽查 readOnly，
 *  但 locked 更稳。）
 */
export function enterReadOnlyGate(
  state: ChoiceSubmitGateState
): ChoiceSubmitGateState {
  return {
    ...state,
    locked: true,
    pendingToken: null,
    seq: state.seq + 1
  }
}

/** 交互是否应被门闩挡住（同步，可在点击/快捷键路径使用） */
export function isSubmitGateBlocking(
  state: ChoiceSubmitGateState,
  ctx: { readOnly: boolean; answerRevealed?: boolean; isGrading?: boolean }
): boolean {
  return (
    ctx.readOnly ||
    !!ctx.answerRevealed ||
    !!ctx.isGrading ||
    state.locked
  )
}
