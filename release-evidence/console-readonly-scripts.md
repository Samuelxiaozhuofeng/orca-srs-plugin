# 只读 Console 证据脚本（WP-02…06, 08…10）

> 在真实 Orca 实例 DevTools Console 中**整段**粘贴运行。
> 每个块均为 `await (async () => { … return … })()`，避免顶层 `return` 的 SyntaxError。
> **只读**：不调用 `insertTag` / `removeTag` / `setProperties` / `deleteBlocks` 等写命令。
> 返回 JSON：含 `orca.state.repo`、ISO 时间、目标 ID、state 与 backend `get-block` 独立对照。

**后端命令依据：** `plugin-docs/documents/Backend-API.md` → `orca.invokeBackend("get-block", blockId)`。

使用前把 `TARGET_*` 换成一次性测试仓库中的真实 ID；**候选为空不得宣称证据完成**。

每段运行后，在 Console 返回对象上右键选择 **Copy object**，再把完整内容粘贴回来。不要只复制 `{…, targetIds: Array(1)}` 这类折叠预览；折叠预览无法审核 state/backend 字段。

---

## 共享 helpers（可先单独执行一次）

```js
await (async () => {
  globalThis.__orcaSrsEvidenceHelpers = {
    pickBlock(b) {
      if (!b) return null
      return {
        id: b.id,
        text: String(b.text || "").slice(0, 200),
        aliases: b.aliases || [],
        children: b.children || [],
        refs: b.refs || [],
        properties: b.properties || [],
        _repr: b._repr ?? null
      }
    },
    async snap(id) {
      const state = orca.state.blocks?.[id] ?? null
      let backend = null
      let backendError = null
      try {
        backend = await orca.invokeBackend("get-block", id)
      } catch (e) {
        backendError = e instanceof Error ? e.message : String(e)
      }
      const h = globalThis.__orcaSrsEvidenceHelpers
      return {
        id,
        state: h.pickBlock(state),
        backend: h.pickBlock(backend),
        backendError
      }
    },
    propValues(props, name) {
      const list = Array.isArray(props) ? props : []
      const hit = list.find((p) => p?.name === name)
      if (!hit) return null
      const v = hit.value
      if (Array.isArray(v) && v.length === 1) return v[0]
      return v ?? null
    },
    parseMaybeJson(v) {
      if (v == null) return null
      if (typeof v === "object") return v
      if (typeof v !== "string") return v
      try {
        return JSON.parse(v)
      } catch (e) {
        return { parseError: e instanceof Error ? e.message : String(e), raw: String(v).slice(0, 200) }
      }
    }
  }
  return { ok: true, repo: orca.state.repo, ts: new Date().toISOString() }
})()
```

---

## WP-02 Flash Home 删除/重置（父块 + List item）

```js
await (async () => {
  const PARENT_IDS = [/* basic/cloze/direction/list parents */]
  const LIST_ITEM_IDS = [/* list item block ids if any */]
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!PARENT_IDS.length && !LIST_ITEM_IDS.length) {
    return { repo, ts, purpose: "WP-02", incomplete: true, reason: "TARGET ids empty" }
  }
  const parents = []
  for (const id of PARENT_IDS) parents.push(await h.snap(id))
  const listItems = []
  for (const id of LIST_ITEM_IDS) listItems.push(await h.snap(id))
  return {
    repo,
    ts,
    purpose: "WP-02-pre-delete-reset",
    targetIds: { parents: PARENT_IDS, listItems: LIST_ITEM_IDS },
    parents,
    listItems
  }
})()
```

---

## WP-03 复习日志分片 + 关联卡对照

```js
await (async () => {
  const pluginName = "orca-srs"
  const TARGET_IDS = [/* cards that have live/deleted logs */]
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  const keys = await orca.plugins.getDataKeys(pluginName)
  const logKeys = (keys || []).filter(
    (k) => /review.?log|srs.*log/i.test(String(k)) || String(k).includes("reviewLog")
  )
  const shards = []
  for (const key of logKeys) {
    const raw = await orca.plugins.getData(pluginName, key)
    let count = 0
    let sample = []
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      const arr = Array.isArray(parsed) ? parsed : parsed?.logs || parsed?.entries || []
      count = Array.isArray(arr) ? arr.length : 0
      sample = (Array.isArray(arr) ? arr : []).slice(0, 8).map((e) => ({
        id: e?.id,
        cardKey: e?.cardKey,
        blockId: e?.blockId,
        timestamp: e?.timestamp
      }))
    } catch (e) {
      sample = [{ parseError: e instanceof Error ? e.message : String(e) }]
    }
    shards.push({ key, count, sample })
  }
  const cards = []
  for (const id of TARGET_IDS) cards.push(await h.snap(id))
  return {
    repo,
    ts,
    purpose: "WP-03-log-shards",
    pluginName,
    targetIds: TARGET_IDS,
    incomplete: TARGET_IDS.length === 0,
    allKeyCount: (keys || []).length,
    shards,
    cards
  }
})()
```

---

## WP-04 IR 当前卡 / 下一卡

```js
await (async () => {
  const currentId = 0 /* set */
  const nextId = 0 /* optional */
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!currentId) {
    return { repo, ts, purpose: "WP-04", incomplete: true, reason: "currentId empty" }
  }
  return {
    repo,
    ts,
    purpose: "WP-04-ir-fields",
    targetIds: { currentId, nextId },
    current: await h.snap(currentId),
    next: nextId ? await h.snap(nextId) : null
  }
})()
```

---

## WP-05 卸载前断点基线

```js
await (async () => {
  const cardId = 0 /* IR card currently open */
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!cardId) {
    return { repo, ts, purpose: "WP-05", incomplete: true, reason: "cardId empty" }
  }
  return {
    repo,
    ts,
    purpose: "WP-05-breakpoint-baseline",
    targetIds: { cardId },
    card: await h.snap(cardId),
    note: "Scroll, close panel / disable plugin, re-run and compare backend props"
  }
})()
```

---

## WP-06 专项队列 / 全部 srs.*.due

```js
await (async () => {
  const SELECTED_IDS = [/* difficult / fixed session candidates */]
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!SELECTED_IDS.length) {
    return { repo, ts, purpose: "WP-06", incomplete: true, reason: "SELECTED_IDS empty" }
  }
  const now = Date.now()
  const selected = []
  for (const id of SELECTED_IDS) {
    const snap = await h.snap(id)
    const props = snap.backend?.properties || snap.state?.properties || []
    const dues = {}
    for (const p of props) {
      if (typeof p?.name === "string" && /\.due$/.test(p.name) && p.name.startsWith("srs")) {
        dues[p.name] = Array.isArray(p.value) && p.value.length === 1 ? p.value[0] : p.value
      }
    }
    const firstDue = Object.values(dues)[0]
    const dueMs = firstDue != null ? Date.parse(String(firstDue)) : NaN
    selected.push({
      ...snap,
      srsDues: dues,
      isDueNow: Number.isFinite(dueMs) ? dueMs <= now : null
    })
  }
  let tagQuery = { ok: false }
  try {
    const tagged = await orca.invokeBackend("get-blocks-with-tags", ["card"])
    tagQuery = { ok: true, count: Array.isArray(tagged) ? tagged.length : null }
  } catch (e) {
    tagQuery = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return {
    repo,
    ts,
    purpose: "WP-06-due-preview",
    targetIds: SELECTED_IDS,
    selected,
    tagQuery
  }
})()
```

---

## WP-08 EPUB manifest（state + backend，属性 string | string[]）

```js
await (async () => {
  const BOOK_IDS = [/* book page block ids */]
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!BOOK_IDS.length) {
    return { repo, ts, purpose: "WP-08", incomplete: true, reason: "BOOK_IDS empty" }
  }
  const books = []
  for (const bookBlockId of BOOK_IDS) {
    const bookSnap = await h.snap(bookBlockId)
    const bprops = bookSnap.backend?.properties || []
    const sprops = bookSnap.state?.properties || []
    const manifestRaw =
      h.propValues(bprops, "epub.manifest") ?? h.propValues(sprops, "epub.manifest")
    const manifest = h.parseMaybeJson(manifestRaw)
    const chapters = []
    for (const ch of manifest?.chapters || []) {
      const cid = ch.blockId
      if (cid == null) {
        chapters.push({ ...ch, snap: null })
        continue
      }
      chapters.push({ key: ch.key, status: ch.status, blockId: cid, snap: await h.snap(cid) })
    }
    books.push({ bookBlockId, bookSnap, manifestSummary: manifest && {
      version: manifest.version,
      status: manifest.status,
      fingerprint: manifest.fingerprint,
      chapterCount: (manifest.chapters || []).length
    }, chapters })
  }
  return { repo, ts, purpose: "WP-08-epub-manifest", targetIds: BOOK_IDS, books }
})()
```

---

## WP-09 Book IR plan（state + backend）

```js
await (async () => {
  const bookBlockId = 0 /* set */
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")
  if (!bookBlockId) {
    return { repo, ts, purpose: "WP-09", incomplete: true, reason: "bookBlockId empty" }
  }
  const bookSnap = await h.snap(bookBlockId)
  const planRaw =
    h.propValues(bookSnap.backend?.properties || [], "ir.bookPlan") ??
    h.propValues(bookSnap.state?.properties || [], "ir.bookPlan")
  const plan = h.parseMaybeJson(planRaw)
  const chapterIds = plan?.selectedChapterIds || []
  const chapters = []
  for (const id of chapterIds) {
    const snap = await h.snap(id)
    chapters.push({
      id,
      snap,
      planOutcome: plan?.outcomes?.[String(id)] ?? null
    })
  }
  return {
    repo,
    ts,
    purpose: "WP-09-book-ir",
    targetIds: { bookBlockId, chapterIds },
    bookSnap,
    planSummary: plan && {
      mode: plan.mode,
      activeChapterId: plan.activeChapterId,
      selectedCount: (plan.selectedChapterIds || []).length,
      outcomes: plan.outcomes
    },
    chapters
  }
})()
```

---

## WP-10 双仓库 / 模块重建探针（不写 Orca）

```js
await (async () => {
  const pluginName = "orca-srs"
  const TARGET_IDS = [/* optional virtual / home / session ids */]
  const ts = new Date().toISOString()
  const repo = orca.state.repo
  const h = globalThis.__orcaSrsEvidenceHelpers
  if (!h) throw new Error("Run shared helpers first")

  // DevTools JS memory only — never writes Orca data APIs.
  const probe = (globalThis.__orcaSrsRepoProbe = globalThis.__orcaSrsRepoProbe || {
    firstSeenAt: ts,
    runs: 0,
    repos: []
  })
  probe.runs += 1
  probe.repos.push({ repo, ts, run: probe.runs })
  if (probe.repos.length > 20) probe.repos = probe.repos.slice(-20)

  const dataKeys = await orca.plugins.getDataKeys(pluginName)
  const interesting = (dataKeys || []).filter((k) => /flash|home|session|ir/i.test(String(k)))
  const stored = {}
  for (const key of interesting.slice(0, 30)) {
    stored[key] = await orca.plugins.getData(pluginName, key)
  }

  const candidateIds = [...TARGET_IDS]
  for (const v of Object.values(stored)) {
    if (typeof v === "number") candidateIds.push(v)
    if (v && typeof v === "object" && typeof v.blockId === "number") candidateIds.push(v.blockId)
  }
  const unique = [...new Set(candidateIds)].slice(0, 15)
  const probes = []
  for (const id of unique) probes.push(await h.snap(id))

  return {
    repo,
    ts,
    purpose: "WP-10-repo-isolation-prior",
    pluginName,
    targetIds: unique,
    incomplete: unique.length === 0,
    moduleProbe: {
      firstSeenAt: probe.firstSeenAt,
      runs: probe.runs,
      repos: probe.repos,
      note: "Same process + new repo: if runs keep incrementing without reload, JS module likely survived; compare after full page reload too."
    },
    interestingKeys: interesting,
    probes
  }
})()
```
