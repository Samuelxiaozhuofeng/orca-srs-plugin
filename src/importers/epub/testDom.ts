/**
 * Install a minimal DOM for Node-based EPUB parser/HTML tests.
 */

import { JSDOM } from "jsdom"

let installed = false

export function ensureTestDom(): void {
  if (installed) return
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://example.test/",
    contentType: "text/html",
    pretendToBeVisual: true
  })
  const g = globalThis as any
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  g.Node = dom.window.Node
  g.HTMLElement = dom.window.HTMLElement
  g.Element = dom.window.Element
  g.Document = dom.window.Document
  installed = true
}
