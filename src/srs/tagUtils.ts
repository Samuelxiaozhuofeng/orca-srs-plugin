/**
 * 标签工具模块
 * 提供大小写不敏感的标签匹配功能
 */

/**
 * 判断引用别名是否为 card 标签（大小写不敏感）
 * 
 * 支持匹配 #card、#Card、#CARD 等各种大小写变体
 * 
 * @param alias - 引用的别名（标签名称）
 * @returns 是否为 card 标签
 */
export function isCardTag(alias: string | undefined): boolean {
  return alias?.toLowerCase() === "card"
}

/**
 * 判断引用别名是否为 choice 标签（大小写不敏感）
 * 
 * 支持匹配 #choice、#Choice、#CHOICE 等各种大小写变体
 * 
 * @param alias - 引用的别名（标签名称）
 * @returns 是否为 choice 标签
 */
export function isChoiceTag(alias: string | undefined): boolean {
  return alias?.toLowerCase() === "choice"
}

/**
 * 判断引用别名是否为 correct 标签（大小写不敏感）
 * 
 * 支持匹配 #correct、#Correct、#CORRECT、#正确 等各种变体
 * 
 * @param alias - 引用的别名（标签名称）
 * @returns 是否为 correct 标签
 */
export function isCorrectTag(alias: string | undefined): boolean {
  if (!alias) return false
  const lower = alias.toLowerCase()
  return lower === "correct" || alias === "正确"
}

/**
 * 判断引用别名是否为 ordered 标签（大小写不敏感）
 * 
 * 支持匹配 #ordered、#Ordered、#ORDERED 等各种大小写变体
 * 
 * @param alias - 引用的别名（标签名称）
 * @returns 是否为 ordered 标签
 */
export function isOrderedTag(alias: string | undefined): boolean {
  return alias?.toLowerCase() === "ordered"
}
