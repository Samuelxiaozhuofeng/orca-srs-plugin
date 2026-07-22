import { describe, expect, it, vi } from "vitest"
import {
  assertContentLengthWithin,
  parseJsonResponseText,
  readResponseJsonLimited,
  readResponseTextLimited,
  ResponseBodyUnreadableError,
  ResponseTooLargeError
} from "./safeResponse"
import { sanitizePublicError } from "./redactSecrets"

function streamedResponse(
  body: string,
  init?: { contentLength?: string; status?: number }
): Response {
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      const chunk = bytes.slice(offset, offset + 8)
      offset += chunk.length
      controller.enqueue(chunk)
    }
  })
  const headers = new Headers()
  if (init?.contentLength != null) headers.set("content-length", init.contentLength)
  return new Response(stream, { status: init?.status ?? 200, headers })
}

describe("safeResponse", () => {
  it("rejects oversized Content-Length before body read", () => {
    const res = streamedResponse("hi", { contentLength: "999999" })
    expect(() => assertContentLengthWithin(res, 100)).toThrow(ResponseTooLargeError)
  })

  it("streams and enforces hard byte cap", async () => {
    const body = "x".repeat(50)
    const res = streamedResponse(body)
    await expect(readResponseTextLimited(res, 20)).rejects.toBeInstanceOf(
      ResponseTooLargeError
    )
  })

  it("returns full text when under limit", async () => {
    const res = streamedResponse('{"ok":true}')
    await expect(readResponseTextLimited(res, 1000)).resolves.toBe('{"ok":true}')
  })

  it("refuses no-stream without Content-Length", async () => {
    const res = {
      headers: { get: () => null },
      body: null,
      text: async () => "should-not-read"
    } as unknown as Response
    await expect(readResponseTextLimited(res, 100)).rejects.toBeInstanceOf(
      ResponseBodyUnreadableError
    )
  })

  it("refuses no-stream even when Content-Length claims a small body", async () => {
    const readArrayBuffer = vi.fn(async () => new ArrayBuffer(1024 * 1024))
    const res = {
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-length" ? "7" : null
      },
      body: null,
      arrayBuffer: readArrayBuffer
    } as unknown as Response
    await expect(readResponseTextLimited(res, 100)).rejects.toBeInstanceOf(
      ResponseBodyUnreadableError
    )
    expect(readArrayBuffer).not.toHaveBeenCalled()
  })
})

describe("parseJsonResponseText", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponseText('{"ok":true}')).toEqual({ ok: true })
  })

  it("accepts trailing junk after a complete JSON value", () => {
    const body = '{"choices":[{"message":{"content":"hi"}}]}extra-bytes'
    expect(parseJsonResponseText(body)).toEqual({
      choices: [{ message: { content: "hi" } }]
    })
  })

  it("parses first SSE data frame", () => {
    const body = [
      "data: {\"choices\":[{\"message\":{\"content\":\"a\"}}]}",
      "",
      "data: [DONE]",
      ""
    ].join("\n")
    expect(parseJsonResponseText(body)).toEqual({
      choices: [{ message: { content: "a" } }]
    })
  })

  it("parses first NDJSON line", () => {
    const body =
      '{"id":"1","choices":[{"message":{"content":"x"}}]}\n{"id":"2"}\n'
    expect(parseJsonResponseText(body)).toEqual({
      id: "1",
      choices: [{ message: { content: "x" } }]
    })
  })

  it("readResponseJsonLimited uses lenient parse", async () => {
    const payload = '{"model":"m1"}trailing'
    const res = streamedResponse(payload)
    await expect(readResponseJsonLimited(res, 1000)).resolves.toEqual({
      model: "m1"
    })
  })
})

describe("sanitizePublicError", () => {
  it("redacts exact key, Bearer, and common auth fields", () => {
    const secret = "my-super-secret-key-12345"
    const msg = `Bearer ${secret} api_key=${secret} "access_token":"${secret}"`
    const out = sanitizePublicError(msg, secret)
    expect(out).not.toContain(secret)
    expect(out).toMatch(/Bearer \*\*\*/)
    expect(out).toMatch(/api_key=\*\*\*/)
    expect(out).toMatch(/"access_token":"\*\*\*"/)
  })
})
