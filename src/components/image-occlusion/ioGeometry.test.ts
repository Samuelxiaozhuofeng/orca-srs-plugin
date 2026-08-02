import { describe, expect, it } from "vitest"
import { clientToRelOnElement, regionStylePercent } from "./ioGeometry"

describe("ioGeometry", () => {
  it("regionStylePercent multiplies by 100", () => {
    expect(regionStylePercent({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%"
    })
  })

  it("clientToRelOnElement uses getBoundingClientRect + scroll", () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 200,
        height: 100,
        right: 300,
        bottom: 150,
        x: 100,
        y: 50,
        toJSON: () => ({})
      }),
      offsetWidth: 200,
      offsetHeight: 100,
      scrollLeft: 0,
      scrollTop: 20
    } as unknown as HTMLElement

    // 点 (100, 50) = 框左上角；y = (0 + scrollTop) / height = 20/100
    const p = clientToRelOnElement(100, 50, el)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0.2)

    // 中心横向
    const mid = clientToRelOnElement(200, 50, el)
    expect(mid.x).toBeCloseTo(0.5)
  })
})
