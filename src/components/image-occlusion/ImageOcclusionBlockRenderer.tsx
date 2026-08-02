/**
 * 编辑器内图片遮罩块：原图 + 实心遮罩预览 + IO×N 徽章。
 * 遮罩相对图片 frame（与编辑/复习同一坐标系）。
 */

import type { DbId } from "../../orca.d.ts"
import {
  getIoMaskNumbers,
  readIoMasksFromBlock,
  resolveImageDisplayUrl,
  type IoRectRegion
} from "../../srs/imageOcclusion"
import SrsErrorBoundary from "../SrsErrorBoundary"
import { regionStylePercent } from "./ioGeometry"

const { useMemo } = window.React
const { useSnapshot } = window.Valtio

type Props = {
  panelId: string
  blockId: DbId
  rndId?: string
  blockLevel?: number
  indentLevel?: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children" | "readonly"
  src?: string
}

function ImageOcclusionBlockInner({
  panelId,
  blockId,
  rndId,
  mirrorId,
  src: reprSrc,
  blockLevel = 0,
  indentLevel = 0,
  initiallyCollapsed,
  renderingMode
}: Props) {
  const snapshot = useSnapshot(orca.state)
  const targetId = mirrorId ?? blockId
  const block = snapshot?.blocks?.[targetId]

  const { displayUrl, count, regions, parseError } = useMemo(() => {
    if (!block) {
      return {
        displayUrl: "",
        count: 0,
        regions: [] as IoRectRegion[],
        parseError: null as string | null
      }
    }
    try {
      const masks = readIoMasksFromBlock(block as any)
      const numbers = getIoMaskNumbers(masks)
      const fromRepr =
        typeof reprSrc === "string" && reprSrc
          ? reprSrc
          : (block as any)?._repr?.src
      const src =
        (typeof fromRepr === "string" && fromRepr) ||
        (block.properties?.find((p: any) => p.name === "srs.io.src")
          ?.value as string) ||
        ""
      return {
        displayUrl: resolveImageDisplayUrl(String(src || "")),
        count: numbers.length,
        regions: (masks?.regions ?? []) as IoRectRegion[],
        parseError: null
      }
    } catch (e) {
      return {
        displayUrl: "",
        count: 0,
        regions: [] as IoRectRegion[],
        parseError: e instanceof Error ? e.message : String(e)
      }
    }
  }, [block, reprSrc])

  const { BlockShell } = orca.components

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId ?? ""}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode as any}
      reprClassName="srs-io-block"
      contentClassName="srs-io-block__content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={
        <div className="srs-io-block__wrap">
          {displayUrl ? (
            <div className="srs-io-frame">
              <img className="srs-io-frame__img" src={displayUrl} alt="" />
              {regions.map((r: IoRectRegion) => (
                <div
                  key={r.id}
                  className="srs-io-mask srs-io-mask--solid srs-io-mask--preview"
                  style={regionStylePercent(r)}
                >
                  <span className="srs-io-mask__label">c{r.n}</span>
                </div>
              ))}
              {count > 0 && (
                <span className="srs-io-block__badge" title="图片遮罩卡">
                  IO×{count}
                </span>
              )}
            </div>
          ) : (
            <div className="srs-io-block__missing">
              {parseError ? `遮罩数据错误：${parseError}` : "（无图片）"}
            </div>
          )}
        </div>
      }
      childrenJsx={null}
    />
  )
}

export default function ImageOcclusionBlockRenderer(props: Props) {
  return (
    <SrsErrorBoundary componentName="图片遮罩块" errorTitle="图片遮罩块加载出错">
      <ImageOcclusionBlockInner {...props} />
    </SrsErrorBoundary>
  )
}
