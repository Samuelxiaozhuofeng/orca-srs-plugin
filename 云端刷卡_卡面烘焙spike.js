/**
 * 卡面烘焙 spike v4 —— 只解决「块引用退化成数字」这一个问题
 *
 * 已完成的验证：
 *   ✅ blockConvert("html") 可用，文字完好
 *   ✅ 内容面窄：纯文字 + 块引用 + 填空（无图片/代码/公式/表格）
 *   ✅ 修复 A 成立：注册 html 行内转换器后输出 <span data-cloze="1">…</span>
 *      且填空片段自带 clozeNumber 字段，多填空可区分
 *   ❌ 修复 B 失败 —— 但原因是 v3 把「引用记录 id」误当成「块 id」去预取
 *
 * v3 暴露的真实映射关系：
 *   content 片段 { t:"r", v:307 }  →  refs 表里 { id:307, to:18352, alias:"真相" }
 *   即 v = 引用记录 id，不是目标块 id；alias 才是应显示的文字。
 *
 * v4 目的：用正确的映射，对比四种解法，选出可靠的那个。
 *
 * 安全性：只读，不注册任何东西，不写笔记数据。
 * 用法：开发者工具 → Console → 整段粘贴 → 看弹窗（标题「v4 引用修复」）。
 */
;(async () => {
  const out = []
  const esc = (s) => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))
  const sec = (t) => out.push(`<h2>${esc(t)}</h2>`)
  const p = (t) => out.push(`<p>${esc(t)}</p>`)
  const pre = (o) => out.push(`<pre>${esc(typeof o === "string" ? o : JSON.stringify(o, null, 1))}</pre>`)
  const verdict = (ok, t) => out.push(`<p class="v ${ok ? "ok" : "bad"}">${ok ? "✅" : "❌"} ${esc(t)}</p>`)
  const note = (t) => out.push(`<p class="note">${esc(t)}</p>`)

  const bake = (block, ctx) => orca.converters.blockConvert(
    "html",
    { content: block.content, children: block.children },
    block._repr ?? { type: "text" },
    block, true, ctx ?? { exportRootId: block.id }
  ).then(h => String(h ?? "")).catch(e => "‼️" + (e?.message ?? e))

  const getBlk = async (id) => orca.state.blocks?.[id]
    ?? await orca.invokeBackend("get-block", id).catch(() => null)

  let cards = []
  try { cards = (await orca.invokeBackend("get-blocks-with-tags", ["card"])) ?? [] }
  catch (e) { alert("抓取失败: " + (e?.message ?? e)); return }
  cards = cards.filter(b => !(b.properties ?? []).some(x => x.name.startsWith("ir.")))

  // ── 找一张「引用退化成数字」的卡 ────────────────────────────────
  sec("1. 定位坏样本")
  const refCards = cards.filter(b => (b.content ?? []).some(f => f.t === "r"))
  let target = null, baseHtml = "", badIds = []
  for (const b of refCards) {
    const html = await bake(b)
    const ids = (b.content ?? []).filter(f => f.t === "r").map(f => f.v)
    const bad = ids.filter(id => new RegExp(`<span>\\s*${id}\\s*</span>`).test(html))
    if (bad.length) { target = b; baseHtml = html; badIds = bad; break }
  }
  if (!target) {
    p("本轮没有引用退化的卡。把 Orca 完全退出重开、不点开任何卡再跑，更容易复现。")
  } else {
    p(`坏样本 #${target.id}，退化的引用记录 id：${JSON.stringify(badIds)}`)
    p("修复前的 HTML："); pre(baseHtml)

    p("★ 这张卡的完整 refs 表（上一轮漏打了，这次是关键证据）：")
    pre((target.refs ?? []).map(r => ({ id: r.id, to: r.to, type: r.type, alias: r.alias })))
    p("content 里的 r 片段：")
    pre((target.content ?? []).filter(f => f.t === "r"))

    // 建立 引用记录id → {to, alias, 目标块文本} 的映射
    const refMap = new Map()
    for (const id of new Set(badIds)) {
      const r = (target.refs ?? []).find(x => x.id === id)
      if (!r) { refMap.set(id, { 找到: false }); continue }
      const tb = await getBlk(r.to)
      refMap.set(id, {
        找到: true, to: r.to, alias: r.alias ?? null,
        目标块文本: (tb?.text ?? "").slice(0, 60) || null
      })
    }
    p("引用记录 id → 目标 的解析结果：")
    pre([...refMap.entries()].map(([id, v]) => ({ 引用id: id, ...v })))

    const anyMissing = [...refMap.values()].some(v => !v.找到)
    if (anyMissing) note("⚠️ 有引用 id 在 refs 表里找不到 —— 那么 alias 路线不可用，只能走目标块文本。")

    // ── 四种解法对比 ──────────────────────────────────────────
    sec("2. 四种解法对比")

    const results = []

    // 解法 A：只给 getRefById（按引用记录 id 查）
    try {
      const html = await bake(target, {
        exportRootId: target.id,
        getRefById: async (refId) => {
          const r = (target.refs ?? []).find(x => x.id === refId)
          return r ? { to: r.to, alias: r.alias } : undefined
        }
      })
      results.push({ 解法: "A. 只给 getRefById", html })
    } catch (e) { results.push({ 解法: "A. 只给 getRefById", html: "‼️" + e.message }) }

    // 解法 B：只给 getBlockById，但用「正确的目标块」（v→to→block）
    const byTarget = new Map()
    for (const [, v] of refMap) if (v.找到) { const tb = await getBlk(v.to); if (tb) byTarget.set(v.to, tb) }
    try {
      const html = await bake(target, {
        exportRootId: target.id,
        getBlockById: (id) => byTarget.get(id) ?? orca.state.blocks?.[id]
      })
      results.push({ 解法: "B. getBlockById(正确目标块)", html })
    } catch (e) { results.push({ 解法: "B. getBlockById(正确目标块)", html: "‼️" + e.message }) }

    // 解法 C：两个都给
    try {
      const html = await bake(target, {
        exportRootId: target.id,
        getBlockById: (id) => byTarget.get(id) ?? orca.state.blocks?.[id],
        getRefById: async (refId) => {
          const r = (target.refs ?? []).find(x => x.id === refId)
          return r ? { to: r.to, alias: r.alias } : undefined
        }
      })
      results.push({ 解法: "C. 两个都给", html })
    } catch (e) { results.push({ 解法: "C. 两个都给", html: "‼️" + e.message }) }

    // 解法 D：不依赖宿主，自己把 <span>数字</span> 换成文字（方案兜底路径）
    let manual = baseHtml
    for (const [id, v] of refMap) {
      const text = v.alias || v.目标块文本 || `#${v.to ?? id}`
      manual = manual.replace(new RegExp(`<span>\\s*${id}\\s*</span>`, "g"),
        `<span class="ref">${esc(text)}</span>`)
    }
    results.push({ 解法: "D. 插件自行替换（兜底）", html: manual })

    for (const r of results) {
      const stillNum = badIds.some(id => new RegExp(`<span>\\s*${id}\\s*</span>`).test(r.html))
      out.push(`<h3>${esc(r.解法)} ${stillNum ? "❌ 仍是数字" : "✅ 已解决"}</h3>`)
      pre(r.html)
    }

    const hostWorks = results.slice(0, 3).some(r =>
      !badIds.some(id => new RegExp(`<span>\\s*${id}\\s*</span>`).test(r.html)))
    const manualWorks = !badIds.some(id =>
      new RegExp(`<span>\\s*${id}\\s*</span>`).test(results[3].html))

    sec("3. 结论")
    verdict(hostWorks, hostWorks
      ? "宿主转换器可以解决引用问题（看上面哪个解法打了勾，那就是要用的方式）"
      : "宿主转换器解决不了引用问题 —— getBlockById / getRefById 都无效")
    verdict(manualWorks, manualWorks
      ? "插件自行替换可行（兜底路径成立，完全可控，不依赖宿主行为）"
      : "连自行替换都失败 —— 需要重新设计引用处理")
  }

  const doc = `<!doctype html><meta charset="utf-8"><title>v4 引用修复</title>
<style>
 body{font:15px/1.65 -apple-system,system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px}
 h1{font-size:22px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
 h3{font-size:14px;margin-top:18px}
 pre{background:#f6f6f6;padding:10px;overflow-x:auto;font-size:12px;white-space:pre-wrap;border-radius:4px}
 .v{font-weight:bold;padding:8px 12px;border-radius:6px;margin:12px 0}
 .ok{background:#e8f7e8;color:#1a6b1a}.bad{background:#fdeaea;color:#a11}
 .note{color:#777;font-size:13px}
</style>
<h1>v4 引用修复验证</h1>
${out.join("\n")}
<h2>把上面 ✅ / ❌ 的行发回即可</h2>`

  try { window.open(URL.createObjectURL(new Blob([doc], { type: "text/html" })), "_blank") }
  catch (e) { console.warn("弹窗被拦：", e) }
  window.__spikeV4 = doc
  console.log("%cv4 完成。弹窗被拦就敲：copy(window.__spikeV4)", "font-weight:bold;color:#4a9")
})()
