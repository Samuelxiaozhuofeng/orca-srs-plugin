// @ts-nocheck
/**
 * 块卡片收集模块属性测�?
 * 
 * 使用 fast-check 进行属性测�?
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
// @ts-nocheck
import * as fc from 'fast-check'
// @ts-nocheck
import type { DbId, Block } from '../orca.d.ts'
// @ts-nocheck

// 模拟 orca 全局对象
const mockBlocks: Record<DbId, Block> = {}

// 设置全局 orca mock
const mockOrca = {
  state: {
    blocks: mockBlocks
  },
  invokeBackend: vi.fn(),
  commands: {
    invokeEditorCommand: vi.fn()
  }
}

// @ts-ignore
globalThis.orca = mockOrca

// 导入被测模块（必须在 mock 之后�?
import { 
// @ts-nocheck
  getAllDescendantIds,
  isQueryBlock,
  getQueryResults,
  hasCardTag,
  collectCardsFromQueryBlock,
  collectCardsFromChildren,
  convertBlockToReviewCards,
  QueryExecutionError
} from './blockCardCollector'
import type { BlockWithRepr } from './blockUtils'
// @ts-nocheck

/**
 * 生成块树结构的辅助函�?
 * 
 * @param depth - 树的最大深�?
 * @param maxChildren - 每个节点的最大子节点�?
 * @returns 生成的块树（根块 ID 和所有块的映射）
 */
function generateBlockTree(
  depth: number,
  maxChildren: number
): { rootId: DbId; blocks: Record<DbId, Block>; allDescendantIds: DbId[] } {
  let nextId = 1
  const blocks: Record<DbId, Block> = {}
  const allDescendantIds: DbId[] = []
  
  function createBlock(currentDepth: number, parentId?: DbId): DbId {
    const id = nextId++ as DbId
    const childCount = currentDepth < depth ? Math.floor(Math.random() * (maxChildren + 1)) : 0
    const children: DbId[] = []
    
    // 先创建块（children 为空�?
    blocks[id] = {
      id,
      created: new Date(),
      modified: new Date(),
      children: [],
      aliases: [],
      properties: [],
      refs: [],
      backRefs: [],
      parent: parentId
    }
    
    // 递归创建子块
    for (let i = 0; i < childCount; i++) {
      const childId = createBlock(currentDepth + 1, id)
      children.push(childId)
      allDescendantIds.push(childId)
    }
    
    // 更新 children
    blocks[id].children = children
    
    return id
  }
  
  const rootId = createBlock(0)
  // 移除根节点自身（allDescendantIds 不应包含根节点）
  
  return { rootId, blocks, allDescendantIds }
}

/**
 * fast-check 任意块树生成�?
 */
const blockTreeArbitrary = fc.record({
  depth: fc.integer({ min: 0, max: 4 }),
  maxChildren: fc.integer({ min: 0, max: 3 })
}).map(({ depth, maxChildren }) => generateBlockTree(depth, maxChildren))

describe('blockCardCollector', () => {
  beforeEach(() => {
    // 清空 mock 数据
    Object.keys(mockBlocks).forEach(key => delete mockBlocks[key as unknown as DbId])
    vi.clearAllMocks()
  })

  describe('isQueryBlock', () => {
    it('should return true for query blocks', () => {
      const queryBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        _repr: { type: 'query' }
      }
      expect(isQueryBlock(queryBlock)).toBe(true)
    })

    it('should return false for non-query blocks', () => {
      const normalBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        _repr: { type: 'text' }
      }
      expect(isQueryBlock(normalBlock)).toBe(false)
    })

    it('should return false for undefined block', () => {
      expect(isQueryBlock(undefined)).toBe(false)
    })

    it('should return false for block without _repr', () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: []
      }
      expect(isQueryBlock(block)).toBe(false)
    })
  })

  describe('getAllDescendantIds', () => {
    /**
     * Property 2: 子块递归遍历完整�?
     * 
     * **Feature: context-menu-review, Property 2: 子块递归遍历完整�?*
     * **Validates: Requirements 2.2, 2.3**
     * 
     * 对于任意块及其子块树，递归遍历函数应该访问树中的每一个节�?
     */
    it('Property 2: getAllDescendantIds should return all descendants in the tree', async () => {
      await fc.assert(
        fc.asyncProperty(blockTreeArbitrary, async ({ rootId, blocks, allDescendantIds }) => {
          // 设置 mock 数据
          Object.keys(mockBlocks).forEach(key => delete mockBlocks[key as unknown as DbId])
          Object.assign(mockBlocks, blocks)
          
          // 执行被测函数
          const result = await getAllDescendantIds(rootId)
          
          // 验证：返回的 ID 数量应该等于预期的后代数�?
          expect(result.length).toBe(allDescendantIds.length)
          
          // 验证：返回的每个 ID 都应该在预期列表�?
          const resultSet = new Set(result)
          const expectedSet = new Set(allDescendantIds)
          
          for (const id of result) {
            expect(expectedSet.has(id)).toBe(true)
          }
          
          // 验证：预期列表中的每�?ID 都应该在返回结果�?
          for (const id of allDescendantIds) {
            expect(resultSet.has(id)).toBe(true)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('should return empty array for block with no children', async () => {
      const block: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = block
      
      const result = await getAllDescendantIds(1 as DbId)
      expect(result).toEqual([])
    })

    it('should handle single level of children', async () => {
      const parent: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [2 as DbId, 3 as DbId],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: []
      }
      const child1: Block = {
        id: 2 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        parent: 1 as DbId
      }
      const child2: Block = {
        id: 3 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        parent: 1 as DbId
      }
      
      mockBlocks[1 as DbId] = parent
      mockBlocks[2 as DbId] = child1
      mockBlocks[3 as DbId] = child2
      
      const result = await getAllDescendantIds(1 as DbId)
      expect(result.sort()).toEqual([2, 3])
    })
  })

  describe('getQueryResults', () => {
    it('should return empty array for non-query block', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        _repr: { type: 'text' }
      }
      mockBlocks[1 as DbId] = block as Block
      
      const result = await getQueryResults(1 as DbId)
      expect(result).toEqual([])
    })

    it('should return results from query block', async () => {
      // 创建带有 properties 的查询块（Orca 的标准存储方式）
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }
      
      // Mock invokeBackend to return block and query results
      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return block
        }
        if (method === 'query') {
          return [2, 3, 4]
        }
        return null
      })
      
      const result = await getQueryResults(1 as DbId)
      expect(result).toEqual([2, 3, 4])
    })

    it('should handle results as block objects', async () => {
      // 创建带有 properties 的查询块
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }

      // Mock invokeBackend：query 返回 Block[]（文档声明的形态），应归一化为 id 列表
      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return block
        }
        if (method === 'query') {
          return [
            { id: 2, text: 'Block 2', properties: [], refs: [], backRefs: [], children: [] },
            { id: 3, text: 'Block 3', properties: [], refs: [], backRefs: [], children: [] }
          ]
        }
        return null
      })

      const result = await getQueryResults(1 as DbId)
      expect(result).toEqual([2, 3])
    })

    it('should normalize mixed number/object results and drop invalid entries', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }

      mockOrca.invokeBackend.mockImplementation(async (method: string) => {
        if (method === 'get-block') {
          return block
        }
        if (method === 'query') {
          // 数字与块对象混合，另含无 id 对象、null、NaN 等非法项
          return [2, { id: 3 }, { foo: 'bar' }, null, NaN, { id: Infinity }]
        }
        return null
      })

      const result = await getQueryResults(1 as DbId)
      expect(result).toEqual([2, 3])
    })

    it('should return empty array for a query that succeeds with no results', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }

      mockOrca.invokeBackend.mockImplementation(async (method: string) => {
        if (method === 'get-block') {
          return block
        }
        if (method === 'query') {
          return []
        }
        return null
      })

      const result = await getQueryResults(1 as DbId)
      expect(result).toEqual([])
    })

    it('should propagate a QueryExecutionError when query execution fails', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }

      const backendError = new Error('backend query exploded')
      mockOrca.invokeBackend.mockImplementation(async (method: string) => {
        if (method === 'get-block') {
          return block
        }
        if (method === 'query') {
          throw backendError
        }
        return null
      })

      // 不再静默返回 []：错误必须向上传播
      await expect(getQueryResults(1 as DbId)).rejects.toThrow(QueryExecutionError)
      await expect(getQueryResults(1 as DbId)).rejects.toThrow('执行查询失败')

      // 原始错误保留在 cause 上
      const rejection = await getQueryResults(1 as DbId).catch(e => e)
      expect(rejection.cause).toBe(backendError)
    })
  })

  describe('hasCardTag', () => {
    it('should return true for block with #card tag', () => {
      const block: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [
          { id: 1 as DbId, from: 1 as DbId, to: 100 as DbId, type: 2, alias: 'card' }
        ],
        backRefs: []
      }
      expect(hasCardTag(block)).toBe(true)
    })

    it('should return true for block with #Card tag (case insensitive)', () => {
      const block: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [
          { id: 1 as DbId, from: 1 as DbId, to: 100 as DbId, type: 2, alias: 'Card' }
        ],
        backRefs: []
      }
      expect(hasCardTag(block)).toBe(true)
    })

    it('should return false for block without #card tag', () => {
      const block: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [
          { id: 1 as DbId, from: 1 as DbId, to: 100 as DbId, type: 2, alias: 'other' }
        ],
        backRefs: []
      }
      expect(hasCardTag(block)).toBe(false)
    })

    it('should return false for undefined block', () => {
      expect(hasCardTag(undefined)).toBe(false)
    })
  })

  describe('collectCardsFromQueryBlock', () => {
    /**
     * Property 1: 查询块卡片收集完整�?
     * 
     * **Feature: context-menu-review, Property 1: 查询块卡片收集完整�?*
     * **Validates: Requirements 1.2**
     * 
     * 对于任意查询块及其结果列表，收集函数返回的卡片集合应该等于结果列表中所有带 #Card 标签块的集合
     */
    it('Property 1: collectCardsFromQueryBlock should collect all cards with #Card tag from query results', async () => {
      // 生成随机查询结果的辅助函�?
      const generateQueryResults = (
        numResults: number,
        numWithCardTag: number
      ): { queryBlockId: DbId; resultIds: DbId[]; cardBlockIds: DbId[] } => {
        const queryBlockId = 1 as DbId
        const resultIds: DbId[] = []
        const cardBlockIds: DbId[] = []
        
        // 确保 numWithCardTag 不超�?numResults
        const actualCardCount = Math.min(numWithCardTag, numResults)
        
        // 生成结果�?
        for (let i = 0; i < numResults; i++) {
          const blockId = (i + 2) as DbId
          resultIds.push(blockId)
          
          const hasCard = i < actualCardCount
          if (hasCard) {
            cardBlockIds.push(blockId)
          }
          
          // 创建�?
          const block: Block = {
            id: blockId,
            created: new Date(),
            modified: new Date(),
            children: [],
            aliases: [],
            properties: [],
            refs: hasCard 
              ? [{ id: 1 as DbId, from: blockId, to: 100 as DbId, type: 2, alias: 'card' }]
              : [],
            backRefs: [],
            text: `Block ${blockId}`
          }
          mockBlocks[blockId] = block
        }
        
        // 创建查询块（使用 properties 存储 _repr，这�?Orca 的标准方式）
        const queryBlock: BlockWithRepr = {
          id: queryBlockId,
          created: new Date(),
          modified: new Date(),
          children: [],
          aliases: [],
          properties: [
            { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
          ],
          refs: [],
          backRefs: []
        }
        mockBlocks[queryBlockId] = queryBlock as Block
        
        // Mock invokeBackend to return block and query results
        mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
          if (method === 'get-block') {
            return mockBlocks[arg] || null
          }
          if (method === 'query') {
            return resultIds
          }
          return null
        })
        
        return { queryBlockId, resultIds, cardBlockIds }
      }

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          async (numResults, numWithCardTag) => {
            // 清空 mock 数据
            Object.keys(mockBlocks).forEach(key => delete mockBlocks[key as unknown as DbId])
            vi.clearAllMocks()
            
            // 生成测试数据
            const { queryBlockId, cardBlockIds } = generateQueryResults(numResults, numWithCardTag)
            
            // 执行被测函数
            const result = await collectCardsFromQueryBlock(queryBlockId)
            
            // 验证：返回的卡片数量应该等于�?#Card 标签的块数量
            // 注意：每�?basic 卡片块生成一张卡�?
            expect(result.length).toBe(cardBlockIds.length)
            
            // 验证：返回的每张卡片�?id 都应该在预期列表�?
            const resultIds = result.map(card => card.id)
            for (const id of resultIds) {
              expect(cardBlockIds).toContain(id)
            }
            
            // 验证：预期列表中的每个块 ID 都应该在返回结果�?
            for (const id of cardBlockIds) {
              expect(resultIds).toContain(id)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return empty array for query block with no results', async () => {
      const queryBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = queryBlock as Block
      
      // Mock invokeBackend to return block and empty query results
      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return mockBlocks[arg] || null
        }
        if (method === 'query') {
          return []
        }
        return null
      })
      
      const result = await collectCardsFromQueryBlock(1 as DbId)
      expect(result).toEqual([])
    })

    it('should return empty array for query block with results but no card tags', async () => {
      // 创建查询�?
      const queryBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = queryBlock as Block
      
      // 创建结果块（�?#card 标签�?
      mockBlocks[2 as DbId] = {
        id: 2 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        text: 'Block 2'
      }
      mockBlocks[3 as DbId] = {
        id: 3 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        text: 'Block 3'
      }
      
      // Mock invokeBackend to return block and query results
      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return mockBlocks[arg] || null
        }
        if (method === 'query') {
          return [2, 3]
        }
        return null
      })
      
      const result = await collectCardsFromQueryBlock(1 as DbId)
      expect(result).toEqual([])
    })

    it('should collect cards when query returns block objects', async () => {
      const queryBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = queryBlock as Block

      // 带 #card 标签的结果块
      const cardBlock: Block = {
        id: 2 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [{ id: 1 as DbId, from: 2 as DbId, to: 100 as DbId, type: 2, alias: 'card' }],
        backRefs: [],
        text: 'Card Block'
      }
      mockBlocks[2 as DbId] = cardBlock

      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return mockBlocks[arg] || null
        }
        if (method === 'query') {
          // 后端按文档返回 Block[]：归一化后仍应收集到卡片
          return [cardBlock]
        }
        return null
      })

      const result = await collectCardsFromQueryBlock(1 as DbId)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe(2)
    })

    it('should propagate query execution failure instead of returning []', async () => {
      const queryBlock: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [
          { name: '_repr', type: 0, value: { type: 'query', q: { kind: 1 } } }
        ],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = queryBlock as Block

      mockOrca.invokeBackend.mockImplementation(async (method: string, arg: any) => {
        if (method === 'get-block') {
          return mockBlocks[arg] || null
        }
        if (method === 'query') {
          throw new Error('backend down')
        }
        return null
      })

      await expect(collectCardsFromQueryBlock(1 as DbId)).rejects.toThrow(QueryExecutionError)
    })
  })

  describe('collectCardsFromChildren', () => {
    it('should collect cards from child blocks', async () => {
      // 创建父块
      const parentBlock: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [2 as DbId, 3 as DbId],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = parentBlock
      
      // 创建子块（一个有 #card 标签，一个没有）
      mockBlocks[2 as DbId] = {
        id: 2 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [{ id: 1 as DbId, from: 2 as DbId, to: 100 as DbId, type: 2, alias: 'card' }],
        backRefs: [],
        text: 'Card Block',
        parent: 1 as DbId
      }
      mockBlocks[3 as DbId] = {
        id: 3 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        text: 'Normal Block',
        parent: 1 as DbId
      }
      
      const result = await collectCardsFromChildren(1 as DbId)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe(2)
    })

    it('should return empty array for block with no children', async () => {
      const block: Block = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: []
      }
      mockBlocks[1 as DbId] = block
      
      const result = await collectCardsFromChildren(1 as DbId)
      expect(result).toEqual([])
    })
  })

  describe('convertBlockToReviewCards', () => {
    /**
     * Property 3: 卡片转换一致�?
     * 
     * **Feature: context-menu-review, Property 3: 卡片转换一致�?*
     * **Validates: Requirements 1.3, 2.4**
     * 
     * 对于任意�?#Card 标签的块，转换为 ReviewCard 后应保留原始块的 ID、内容和 SRS 状�?
     */
    it('Property 3: convertBlockToReviewCards should preserve block ID and content', async () => {
      // 生成随机卡片块的辅助函数
      const generateCardBlock = (id: number, text: string): BlockWithRepr => {
        return {
          id: id as DbId,
          created: new Date(),
          modified: new Date(),
          children: [],
          aliases: [],
          properties: [],
          refs: [{ id: 1 as DbId, from: id as DbId, to: 100 as DbId, type: 2, alias: 'card' }],
          backRefs: [],
          text: text
        }
      }

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (blockId, blockText) => {
            // 清空 mock 数据
            Object.keys(mockBlocks).forEach(key => delete mockBlocks[key as unknown as DbId])
            vi.clearAllMocks()
            
            // 生成测试数据
            const block = generateCardBlock(blockId, blockText)
            mockBlocks[blockId as DbId] = block as Block
            
            // 执行被测函数
            const result = await convertBlockToReviewCards(block)
            
            // 验证：应该生成至少一张卡片（basic 卡片�?
            expect(result.length).toBeGreaterThanOrEqual(1)
            
            // 验证：卡�?ID 应该与原始块 ID 一�?
            for (const card of result) {
              expect(card.id).toBe(blockId)
            }
            
            // 验证：卡片应该有 SRS 状�?
            for (const card of result) {
              expect(card.srs).toBeDefined()
              expect(card.srs.stability).toBeDefined()
              expect(card.srs.difficulty).toBeDefined()
              expect(card.srs.due).toBeDefined()
            }
            
            // 验证：卡片应该有 deck 属�?
            for (const card of result) {
              expect(card.deck).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return empty array for block without #card tag', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [],
        backRefs: [],
        text: 'Normal Block'
      }
      
      const result = await convertBlockToReviewCards(block)
      expect(result).toEqual([])
    })

    it('should skip suspended cards', async () => {
      const block: BlockWithRepr = {
        id: 1 as DbId,
        created: new Date(),
        modified: new Date(),
        children: [],
        aliases: [],
        properties: [],
        refs: [{ 
          id: 1 as DbId, 
          from: 1 as DbId, 
          to: 100 as DbId, 
          type: 2, 
          alias: 'card',
          data: [{ name: 'status', type: 1, value: 'suspend' }]
        }],
        backRefs: [],
        text: 'Suspended Card'
      }
      
      const result = await convertBlockToReviewCards(block)
      expect(result).toEqual([])
    })
  })

  describe('FC-05 extracts/topic skip and choice identity', () => {
    function cardBlockWithType(id, typeValue, extras = {}) {
      return {
        id,
        created: new Date(),
        modified: new Date(),
        children: extras.children ?? [],
        aliases: [],
        properties: [],
        refs: [{
          id: 1,
          from: id,
          to: 100,
          type: 2,
          alias: extras.alias ?? 'card',
          data: typeValue == null ? [] : [{ name: 'type', type: 1, value: typeValue }]
        }],
        backRefs: [],
        text: extras.text ?? 'Card content'
      }
    }

    it('should skip extracts cards (not return as SRS ReviewCard)', async () => {
      const block = cardBlockWithType(11, 'extracts')
      const result = await convertBlockToReviewCards(block)
      expect(result).toEqual([])
    })

    it('should skip topic cards (not return as SRS ReviewCard)', async () => {
      const block = cardBlockWithType(12, 'topic')
      const result = await convertBlockToReviewCards(block)
      expect(result).toEqual([])
    })

    it('should set cardType choice for choice cards', async () => {
      // Need #card for hasCardTag; #choice makes extractCardType return choice
      const block = cardBlockWithType(13, null, {
        children: [201, 202],
        text: 'Question?'
      })
      block.refs = [
        {
          id: 1,
          from: 13,
          to: 100,
          type: 2,
          alias: 'card',
          data: []
        },
        {
          id: 2,
          from: 13,
          to: 101,
          type: 2,
          alias: 'choice',
          data: []
        }
      ]
      const result = await convertBlockToReviewCards(block)
      expect(result).toHaveLength(1)
      expect(result[0].cardType).toBe('choice')
      expect(result[0].id).toBe(13)
    })
  })
})
