import { describe, expect, it } from "vitest"
import { deriveModelsListUrl } from "./aiModelsFetch"

describe("deriveModelsListUrl", () => {
  it("maps OpenAI chat/completions to /v1/models", () => {
    expect(
      deriveModelsListUrl("https://api.openai.com/v1/chat/completions")
    ).toBe("https://api.openai.com/v1/models")
  })

  it("maps DeepSeek chat/completions to /models", () => {
    expect(
      deriveModelsListUrl("https://api.deepseek.com/chat/completions")
    ).toBe("https://api.deepseek.com/models")
  })

  it("maps Ollama compatible endpoint", () => {
    expect(
      deriveModelsListUrl("http://localhost:11434/v1/chat/completions")
    ).toBe("http://localhost:11434/v1/models")
  })

  it("strips query string", () => {
    expect(
      deriveModelsListUrl(
        "https://api.openai.com/v1/chat/completions?foo=1"
      )
    ).toBe("https://api.openai.com/v1/models")
  })

  it("returns null for Azure OpenAI host", () => {
    expect(
      deriveModelsListUrl(
        "https://myres.openai.azure.com/openai/deployments/x/chat/completions?api-version=2023-05-15"
      )
    ).toBeNull()
  })

  it("returns null for invalid URL", () => {
    expect(deriveModelsListUrl("not-a-url")).toBeNull()
    expect(deriveModelsListUrl("")).toBeNull()
  })
})
