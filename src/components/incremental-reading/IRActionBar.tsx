/**
 * 底部固定动作栏：下一篇、推后、更多（主界面 ≤3 高频动作）
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
    <div style={{
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      position: "sticky",
      bottom: 0,
      paddingTop: "8px",
      background: "var(--orca-color-bg-1)",
      borderTop: "1px solid var(--orca-color-border-1)"
    }}>
      <Button variant="solid" onClick={onNext} style={style}>
        下一篇
      </Button>
      {isTopic ? (
        <Button variant="plain" onClick={onExtract} style={style}>
          摘录
        </Button>
      ) : (
        <Button variant="plain" onClick={onItemize} style={style}>
          记住
        </Button>
      )}
      <Button variant="plain" onClick={onPostpone} style={style}>
        推后
      </Button>
      <Button variant="outline" onClick={onMore} style={style}>
        {moreOpen ? "收起" : "更多"}
      </Button>
    </div>
  )
}
