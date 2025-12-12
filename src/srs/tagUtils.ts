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
