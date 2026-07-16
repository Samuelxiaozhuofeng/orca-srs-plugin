/**
 * 统计数据内存缓存
 */

/**
 * 缓存条目接口
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

/**
 * 统计数据缓存
 * 用于缓存计算结果，避免重复计算
 */
class StatisticsCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private readonly defaultTTL = 30000 // 默认缓存 30 秒
  private readonly maxEntries = 100 // 最大缓存条目数

  /**
   * 生成缓存键
   */
  private generateKey(type: string, ...params: (string | number | undefined)[]): string {
    return `${type}:${params.filter(p => p !== undefined).join(":")}`
  }

  /**
   * 获取缓存数据
   */
  get<T>(type: string, ...params: (string | number | undefined)[]): T | null {
    const key = this.generateKey(type, ...params)
    const entry = this.cache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      return null
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.defaultTTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * 设置缓存数据
   */
  set<T>(type: string, data: T, ...params: (string | number | undefined)[]): void {
    const key = this.generateKey(type, ...params)

    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    })
  }

  /**
   * 清除特定类型的缓存
   */
  invalidate(type: string): void {
    const prefix = `${type}:`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries
    }
  }
}

// 全局缓存实例
export const statisticsCache = new StatisticsCache()

/**
 * 清除统计缓存
 * 在复习完成后调用以确保数据更新
 */
export function clearStatisticsCache(): void {
  statisticsCache.clear()
}

/**
 * 清除特定类型的统计缓存
 */
export function invalidateStatisticsCache(type: string): void {
  statisticsCache.invalidate(type)
}
