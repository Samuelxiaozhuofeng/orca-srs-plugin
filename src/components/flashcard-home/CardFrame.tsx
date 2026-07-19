/**
 * Presentational card shell for Flash Home list items.
 * Accent strip + body slot; status drives left-edge color only.
 */

import type { ReactNode } from "react"
import { getAccentClass, type CardDueStatus } from "./cardStatus"

type CardFrameProps = {
  status: CardDueStatus
  children: ReactNode
  className?: string
}

export default function CardFrame({ status, children, className }: CardFrameProps) {
  const rootClass = className
    ? `srs-card-frame ${className}`
    : "srs-card-frame"

  return (
    <div className={rootClass}>
      <div
        className={`srs-card-frame__accent ${getAccentClass(status)}`}
        aria-hidden="true"
      />
      <div className="srs-card-frame__body">{children}</div>
    </div>
  )
}
