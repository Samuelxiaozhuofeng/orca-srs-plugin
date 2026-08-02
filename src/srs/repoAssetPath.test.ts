import { afterEach, describe, expect, it, vi } from "vitest"
import {
  absolutePathToFileUrl,
  resolveRepoAssetAbsolutePath,
  resolveRepoAssetDisplayUrl
} from "./repoAssetPath"

describe("repoAssetPath", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("resolveRepoAssetAbsolutePath strips ./ and assets/", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/data/repos/r1" },
      utils: { getAssetPath: (p: string) => p }
    })
    expect(resolveRepoAssetAbsolutePath("./a.mp3")).toBe(
      "/data/repos/r1/assets/a.mp3"
    )
    expect(resolveRepoAssetAbsolutePath("assets/a.mp3")).toBe(
      "/data/repos/r1/assets/a.mp3"
    )
  })

  it("恒等 getAssetPath 时仍经 repoDir 解析为 file URL", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/Users/me/orca/repos/demo" },
      utils: { getAssetPath: (p: string) => p }
    })
    const url = resolveRepoAssetDisplayUrl("./sound.mp3")
    expect(url).toMatch(/^file:\/\//)
    expect(url).toContain("/assets/sound.mp3")
    expect(url).not.toBe("./sound.mp3")
  })

  it("repoDir 不可用时抛明确错误", () => {
    vi.stubGlobal("orca", {
      state: {},
      utils: { getAssetPath: (p: string) => p }
    })
    expect(() => resolveRepoAssetDisplayUrl("./x.mp3")).toThrow(
      /repoDir|assets/
    )
  })

  it("dataDir+repo 拼路径", () => {
    vi.stubGlobal("orca", {
      state: { dataDir: "/var/orca/", repo: "myrepo" },
      utils: { getAssetPath: (p: string) => p }
    })
    expect(resolveRepoAssetAbsolutePath("b.mp3")).toBe(
      "/var/orca/repos/myrepo/assets/b.mp3"
    )
  })

  it("http(s)/file/blob 原样；绝对路径转 file://", () => {
    vi.stubGlobal("orca", {
      state: { repoDir: "/r" },
      utils: { getAssetPath: (p: string) => p }
    })
    expect(resolveRepoAssetDisplayUrl("https://ex.com/a.mp3")).toBe(
      "https://ex.com/a.mp3"
    )
    expect(resolveRepoAssetDisplayUrl("blob:abc")).toBe("blob:abc")
    expect(absolutePathToFileUrl("/tmp/foo bar.mp3")).toBe(
      "file:///tmp/foo%20bar.mp3"
    )
  })
})
