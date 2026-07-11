/**
 * 底部固定动作栏：下一篇、摘录|记住、推后、更多
 */

const { Button } = orca.components

export type IRActionBarProps = {
  isTopic: boolean
  isWorking?: boolean
  onNext: () => void
  onPostpone: () => void
  onExtract?: () => void
  onItemize?: () => void
  onMore: () => void
  moreOpen?: boolean
}

export default function IRActionBar({
  isTopic,
  isWorking,
  onNext,
  onPostpone,
  onExtract,
  onItemize,
  onMore,
  moreOpen
}: IRActionBarProps) {
  const style = isWorking ? { opacity: 0.6, pointerEvents: "none" as const } : undefined

  return (
    <div className="ir-reading__footer" role="toolbar" aria-label="阅读动作">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button tabIndex={0} variant="solid" onClick={isWorking ? undefined : onNext} style={style} aria-disabled={isWorking} title="下一篇 Enter">
          下一篇
        </Button>
        {isTopic ? (
          <Button tabIndex={0} variant="plain" onClick={isWorking ? undefined : onExtract} style={style} aria-disabled={isWorking} title="摘录 Alt+X">
            摘录
          </Button>
        ) : (
          <Button tabIndex={0} variant="plain" onClick={isWorking ? undefined : onItemize} style={style} aria-disabled={isWorking} title="记住 Alt+Z">
            记住
          </Button>
        )}
        <Button tabIndex={0} variant="plain" onClick={isWorking ? undefined : onPostpone} style={style} aria-disabled={isWorking} title="推后 Shift+Enter">
          推后
        </Button>
        <Button
          tabIndex={0}
          variant="outline"
          onClick={isWorking ? undefined : onMore}
          style={style}
          aria-disabled={isWorking}
          aria-expanded={moreOpen}
          title="更多操作"
        >
          {moreOpen ? "收起" : "更多"}
        </Button>
      </div>
    </div>
  )
}
