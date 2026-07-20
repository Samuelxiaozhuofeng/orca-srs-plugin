/**
 * 只读诊断：SRS Basic 答案区 Tab / Shift+Tab / Enter 后编辑会话状态。
 *
 * 用法（Orca Console）：
 *   1. 粘贴本文件全文并回车
 *   2. 打开复习面板 → Basic 卡 → 显示答案 → 点击答案子块
 *   3. 按 Tab / Shift+Tab / Enter，观察 console 输出的紧凑 JSON
 *   4. 卸载：window.__srsDiagnoseReviewTabFocus.uninstall()
 *
 * 约束：不修改任何数据 / DOM / selection；失败写入 errors，不静默吞掉。
 */
;(function diagnoseReviewTabFocus() {
  const GLOBAL_KEY = "__srsDiagnoseReviewTabFocus"
  const prev = window[GLOBAL_KEY]
  if (prev && typeof prev.uninstall === "function") {
    try {
      prev.uninstall()
    } catch (e) {
      console.warn("[srs-diagnose-tab] previous uninstall failed", e)
    }
  }

  const AFTER_DELAYS_MS = [0, 16, 50, 100, 250]
  const KEYS = new Set(["Tab", "Enter"])

  function safeCall(label, fn, errors) {
    try {
      return fn()
    } catch (err) {
      errors.push({
        label,
        message: err && err.message ? String(err.message) : String(err),
        name: err && err.name ? String(err.name) : undefined
      })
      return null
    }
  }

  async function safeCallAsync(label, fn, errors) {
    try {
      return await fn()
    } catch (err) {
      errors.push({
        label,
        message: err && err.message ? String(err.message) : String(err),
        name: err && err.name ? String(err.name) : undefined
      })
      return null
    }
  }

  function describeActiveElement(el) {
    if (!el || el === document.body) {
      return { tag: el ? el.tagName : null, className: null, isContentEditable: false }
    }
    return {
      tag: el.tagName,
      id: el.id || undefined,
      className: typeof el.className === "string" ? el.className.slice(0, 200) : String(el.className || "").slice(0, 200),
      isContentEditable: !!el.isContentEditable,
      contentEditableAttr: el.getAttribute ? el.getAttribute("contenteditable") : null,
      dataId: el.getAttribute ? el.getAttribute("data-id") : null
    }
  }

  function selectionInAnswer(sel) {
    const answer = document.querySelector(".srs-answer-block")
    if (!answer || !sel || sel.rangeCount === 0) {
      return { inAnswer: false, answerFound: !!answer, rangeCount: sel ? sel.rangeCount : 0 }
    }
    try {
      const range = sel.getRangeAt(0)
      const node = range.commonAncestorContainer
      const el = node.nodeType === 1 ? node : node.parentElement
      return {
        inAnswer: !!(el && answer.contains(el)),
        answerFound: true,
        rangeCount: sel.rangeCount
      }
    } catch (err) {
      return {
        inAnswer: false,
        answerFound: true,
        rangeCount: sel.rangeCount,
        error: err && err.message ? String(err.message) : String(err)
      }
    }
  }

  function snapshotCursorData(errors) {
    return safeCall("getCursorDataFromSelection", () => {
      if (!window.orca || !orca.utils || typeof orca.utils.getCursorDataFromSelection !== "function") {
        throw new Error("orca.utils.getCursorDataFromSelection unavailable")
      }
      const sel = window.getSelection()
      return orca.utils.getCursorDataFromSelection(sel)
    }, errors)
  }

  function stateBlockSummary(blockId, errors) {
    if (blockId == null) return null
    return safeCall("state.blocks[" + blockId + "]", () => {
      const blocks = orca.state && orca.state.blocks
      if (!blocks) throw new Error("orca.state.blocks unavailable")
      const b = blocks[blockId]
      if (!b) return { found: false, blockId }
      const children = Array.isArray(b.children)
        ? b.children.map((c) => (c && typeof c === "object" && "id" in c ? c.id : c))
        : b.children
      return {
        found: true,
        blockId,
        parent: b.parent,
        children,
        aliases: b.aliases
      }
    }, errors)
  }

  async function backendBlock(blockId, errors) {
    if (blockId == null) return null
    return safeCallAsync("invokeBackend get-block " + blockId, async () => {
      if (!orca.invokeBackend) throw new Error("orca.invokeBackend unavailable")
      const block = await orca.invokeBackend("get-block", blockId)
      if (block == null) return { found: false, blockId, raw: null }
      return {
        found: true,
        blockId,
        id: block.id,
        parent: block.parent,
        children: Array.isArray(block.children)
          ? block.children.map((c) => (c && typeof c === "object" && "id" in c ? c.id : c))
          : block.children
      }
    }, errors)
  }

  async function captureSnapshot(phase, eventMeta) {
    const errors = []
    const repo = safeCall("orca.state.repo", () => {
      return orca.state && orca.state.repo != null ? orca.state.repo : null
    }, errors)

    const cursorData = snapshotCursorData(errors)
    const focusBlockId =
      cursorData && cursorData.focus && cursorData.focus.blockId != null
        ? cursorData.focus.blockId
        : null

    const sel = window.getSelection()
    const selection = selectionInAnswer(sel)
    const active = describeActiveElement(document.activeElement)
    const stateFocus = stateBlockSummary(focusBlockId, errors)
    const backendFocus = await backendBlock(focusBlockId, errors)

    return {
      phase,
      t: Date.now(),
      repo,
      event: eventMeta,
      cursorData,
      selection,
      activeElement: active,
      focusBlockState: stateFocus,
      focusBlockBackend: backendFocus,
      answerDom: {
        present: !!document.querySelector(".srs-answer-block"),
        questionLive: !!document.querySelector(".srs-question-block"),
        questionStatic: !!document.querySelector(".srs-question-static")
      },
      errors
    }
  }

  function onKeyDown(ev) {
    if (!KEYS.has(ev.key)) return
    // 仅在复习 UI 存在时采样，避免污染全局编辑诊断噪音
    const inReview =
      document.querySelector(".srs-answer-block") ||
      document.querySelector(".srs-card-container") ||
      document.querySelector(".srs-review-session")
    if (!inReview) return

    const eventMeta = {
      type: "keydown",
      key: ev.key,
      shiftKey: !!ev.shiftKey,
      altKey: !!ev.altKey,
      metaKey: !!ev.metaKey,
      ctrlKey: !!ev.ctrlKey,
      defaultPrevented: !!ev.defaultPrevented,
      targetTag: ev.target && ev.target.tagName,
      targetClass:
        ev.target && typeof ev.target.className === "string"
          ? ev.target.className.slice(0, 160)
          : undefined
    }

    const runId = Date.now() + "-" + Math.random().toString(36).slice(2, 7)

    captureSnapshot("before", { ...eventMeta, runId, defaultPrevented: !!ev.defaultPrevented })
      .then((snap) => {
        console.log("[srs-diagnose-tab]", JSON.stringify(snap))
      })
      .catch((err) => {
        console.error("[srs-diagnose-tab] before snapshot failed", err)
      })

    // 多档 after：宿主 indent/split 多为异步；不改 selection，仅读
    for (const delay of AFTER_DELAYS_MS) {
      setTimeout(() => {
        captureSnapshot("after+" + delay + "ms", {
          ...eventMeta,
          runId,
          // 再读一次 defaultPrevented（keydown 处理链可能已改）
          defaultPrevented: !!ev.defaultPrevented
        })
          .then((snap) => {
            console.log("[srs-diagnose-tab]", JSON.stringify(snap))
          })
          .catch((err) => {
            console.error("[srs-diagnose-tab] after snapshot failed", err)
          })
      }, delay)
    }
  }

  window.addEventListener("keydown", onKeyDown, true)

  function uninstall() {
    window.removeEventListener("keydown", onKeyDown, true)
    if (window[GLOBAL_KEY] && window[GLOBAL_KEY].uninstall === uninstall) {
      delete window[GLOBAL_KEY]
    }
    console.log("[srs-diagnose-tab] uninstalled")
  }

  window[GLOBAL_KEY] = {
    uninstall,
    version: 2,
    keys: Array.from(KEYS),
    afterDelaysMs: AFTER_DELAYS_MS.slice()
  }

  console.log(
    "[srs-diagnose-tab] installed. Keys:",
    Array.from(KEYS).join("/"),
    "after delays ms:",
    AFTER_DELAYS_MS.join(","),
    "| uninstall: window." + GLOBAL_KEY + ".uninstall()"
  )
})()
