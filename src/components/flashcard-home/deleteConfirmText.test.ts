/**
 * 删除确认文案：结构恢复 + 进度清除；Cloze 额外提示格式不可恢复。
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

beforeAll(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    React: {
      useState: vi.fn(),
      useEffect: vi.fn(),
      useCallback: vi.fn(),
      useMemo: vi.fn(),
      useRef: vi.fn()
    }
  }
  ;(globalThis as unknown as { orca: unknown }).orca = {
    components: { Button: () => null, ConfirmBox: () => null, Block: () => null },
    commands: { invokeEditorCommand: vi.fn() },
    notify: vi.fn(),
    state: { blocks: {} }
  }
})

describe("deleteConfirmText", () => {
  it("cloze 变体：恢复普通文本 + 进度 + 格式不可恢复提示", async () => {
    const { deleteConfirmText } = await import("./CardListItem")
    const text = deleteConfirmText({ clozeNumber: 2 })
    expect(text).toContain("填空（c2）")
    expect(text).toContain("将恢复为普通文本并删除复习进度")
    expect(text).toContain("加粗、链接等")
    expect(text).toContain("无法恢复")
  })

  it("direction 变体：恢复普通文本 + 进度", async () => {
    const { deleteConfirmText } = await import("./CardListItem")
    const text = deleteConfirmText({ directionType: "forward" })
    expect(text).toContain("正向")
    expect(text).toContain("将恢复为普通文本并删除复习进度")
  })

  it("list 整卡：含子条目进度", async () => {
    const { deleteConfirmText } = await import("./CardListItem")
    const text = deleteConfirmText({ cardType: "list" })
    expect(text).toContain("列表卡")
    expect(text).toContain("将恢复为普通文本并删除复习进度")
    expect(text).toContain("直接子条目")
  })

  it("IO 遮罩文案保持 masks 语义（不混入文本解包措辞）", async () => {
    const { deleteConfirmText } = await import("./CardListItem")
    const text = deleteConfirmText({
      cardType: "image-occlusion",
      clozeNumber: 1
    })
    expect(text).toContain("遮罩")
    expect(text).toContain("遮罩区域")
    expect(text).not.toContain("加粗、链接")
  })
})
