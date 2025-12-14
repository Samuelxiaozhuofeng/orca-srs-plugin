/**
 * AI 卡片创建模块
 * 
 * 使用 AI 生成问答对并创建 SRS 卡片
 */

import type { CursorData, Block } from "../../orca.d.ts"
import { generateCardFromAI } from "./aiService"
import { ensureCardSrsState } from "../storage"
import { BlockWithRepr } from "../blockUtils"

/**
 * AI 卡片创建结果
 */
export interface AICardCreateResult {
  blockId: number
  question: string
  answer: string
}

/**
 * 使用 AI 创建 Basic Card
 * 
 * 流程：
 * 1. 获取当前 block 的文本内容
 * 2. 调用 AI 生成问答对
 * 3. 创建子 block（问题）
 * 4. 创建孙子 block（答案）
 * 5. 给子 block 添加 #card 标签并转换为 SRS 卡片
 * 
 * @param cursor - 当前光标位置
 * @param pluginName - 插件名称
 * @returns 创建结果或 null
 */
export async function makeAICardFromBlock(
  cursor: CursorData,
  pluginName: string
): Promise<AICardCreateResult | null> {
  console.log(`[${pluginName}] ========== makeAICardFromBlock 开始执行 ==========`)
  
  // 验证光标位置
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }
  
  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block
  
  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }
  
  // 获取块内容
  const content = block.text?.trim()
  if (!content) {
    orca.notify("warn", "当前块内容为空，无法生成卡片", { title: "AI 卡片" })
    console.warn(`[${pluginName}] 警告：块 #${blockId} 内容为空`)
    return null
  }
  
  console.log(`[${pluginName}] 原始块 ID: ${blockId}`)
  console.log(`[${pluginName}] 原始内容: "${content}"`)
  
  // 显示加载提示
  orca.notify("info", "正在调用 AI 生成卡片...", { title: "AI 卡片" })
  
  // 调用 AI 生成问答
  const result = await generateCardFromAI(pluginName, content)
  
  if (!result.success) {
    orca.notify("error", result.error.message, { title: "AI 卡片生成失败" })
    console.error(`[${pluginName}] AI 生成失败: ${result.error.message}`)
    return null
  }
  
  const { question, answer } = result.data
  console.log(`[${pluginName}] AI 生成成功`)
  console.log(`[${pluginName}]   问题: "${question}"`)
  console.log(`[${pluginName}]   答案: "${answer}"`)
  
  try {
    // 1. 创建子 block（问题）
    console.log(`[${pluginName}] 创建子块（问题）...`)
    const childBlockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      block,
      "lastChild",
      [{ t: "t", v: question }]
    )
    
    if (!childBlockId) {
      orca.notify("error", "创建子块失败", { title: "AI 卡片" })
      console.error(`[${pluginName}] 创建子块失败`)
      return null
    }
    
    console.log(`[${pluginName}] 子块创建成功: #${childBlockId}`)
    
    // 2. 获取子块并创建孙子 block（答案）
    const childBlock = orca.state.blocks[childBlockId] as Block
    if (!childBlock) {
      orca.notify("error", "无法获取子块", { title: "AI 卡片" })
      console.error(`[${pluginName}] 无法获取子块 #${childBlockId}`)
      return null
    }
    
    console.log(`[${pluginName}] 创建孙子块（答案）...`)
    const grandchildBlockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      childBlock,
      "lastChild",
      [{ t: "t", v: answer }]
    )
    
    if (!grandchildBlockId) {
      orca.notify("error", "创建孙子块失败", { title: "AI 卡片" })
      console.error(`[${pluginName}] 创建孙子块失败`)
      // 回滚：删除已创建的子块
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteBlocks",
        null,
        [childBlockId]
      )
      return null
    }
    
    console.log(`[${pluginName}] 孙子块创建成功: #${grandchildBlockId}`)
    
    // 3. 给子块添加 #card 标签
    console.log(`[${pluginName}] 添加 #card 标签到子块...`)
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      cursor,
      childBlockId,
      "card"
    )
    
    console.log(`[${pluginName}] #card 标签添加成功`)
    
    // 4. 设置子块的 _repr 为 SRS 卡片
    const updatedChildBlock = orca.state.blocks[childBlockId] as BlockWithRepr
    if (updatedChildBlock) {
      updatedChildBlock._repr = {
        type: "srs.card",
        front: question,
        back: answer,
        cardType: "basic"
      }
      console.log(`[${pluginName}] 子块 _repr 已设置为 srs.card`)
    }
    
    // 5. 初始化 SRS 状态（仅在未初始化时写入）
    console.log(`[${pluginName}] 初始化 SRS 状态...`)
    await ensureCardSrsState(childBlockId)
    
    console.log(`[${pluginName}] ========== AI 卡片创建完成 ==========`)
    console.log(`[${pluginName}] 结构：`)
    console.log(`[${pluginName}]   原始块 #${blockId}: "${content}"`)
    console.log(`[${pluginName}]     └─ 子块 #${childBlockId} [#card]: "${question}"`)
    console.log(`[${pluginName}]         └─ 孙子块 #${grandchildBlockId}: "${answer}"`)
    
    // 显示成功通知
    orca.notify(
      "success", 
      `已生成卡片\n问题: ${question}\n答案: ${answer}`, 
      { title: "AI 卡片创建成功" }
    )
    
    return { 
      blockId: childBlockId,
      question,
      answer
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[${pluginName}] AI 卡片创建异常:`, error)
    orca.notify("error", `创建失败: ${errorMessage}`, { title: "AI 卡片" })
    return null
  }
}
