/**
 * Delta Update Generator
 * Generates JSON Patch operations for efficient real-time updates
 */

import { TableChange } from './table-state-detector'
import { deepClone } from './utils/deep-clone'
import { validatePath } from './utils/path-validator'
import { TableListing } from '@primo-poker/shared'

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  value?: unknown
  from?: string
}

export class DeltaUpdateGenerator {
  /**
   * Generate JSON Patch operations from table changes
   */
  generatePatch(changes: TableChange[]): JsonPatchOperation[] {
    const patch: JsonPatchOperation[] = []
    
    for (const change of changes) {
      switch (change.type) {
        case 'TABLE_CREATED':
          patch.push({
            op: 'add',
            path: `/tables/${change.tableId}`,
            value: change.data
          })
          break
          
        case 'TABLE_REMOVED':
          patch.push({
            op: 'remove',
            path: `/tables/${change.tableId}`
          })
          break
          
        case 'TABLE_UPDATED':
          if (change.fields && change.updates) {
            for (const field of change.fields) {
              const path = `/tables/${change.tableId}/${field}`
              validatePath(path) // Validate path before using
              
              // Type-safe field access
              const updates = change.updates as Partial<TableListing>
              const value = updates[field as keyof TableListing]
              
              if (value !== undefined) {
                patch.push({
                  op: 'replace',
                  path,
                  value
                })
              }
            }
          }
          break
          
        case 'STATS_UPDATED':
          if (change.stats) {
            patch.push({
              op: 'replace',
              path: `/tables/${change.tableId}/avgPot`,
              value: change.stats.avgPot
            })
            patch.push({
              op: 'replace',
              path: `/tables/${change.tableId}/handsPerHour`,
              value: change.stats.handsPerHour
            })
          }
          break
      }
    }
    
    return patch
  }
  
  /**
   * Apply a JSON Patch to a state object
   */
  applyPatch(state: Record<string, unknown>, patch: JsonPatchOperation[]): Record<string, unknown> {
    // Deep clone the state to avoid mutations
    const newState = deepClone(state)
    
    for (const operation of patch) {
      // Validate path before processing
      validatePath(operation.path)
      const pathParts = operation.path.split('/').filter(p => p)
      
      switch (operation.op) {
        case 'add':
          this.addValue(newState, pathParts, operation.value)
          break
        case 'remove':
          this.removeValue(newState, pathParts)
          break
        case 'replace':
          this.replaceValue(newState, pathParts, operation.value)
          break
      }
    }
    
    return newState
  }
  
  private addValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
    const key = path[path.length - 1]
    if (!key) return
    const parent = this.resolvePath(obj, path.slice(0, -1))
    if (parent) {
      parent[key] = value
    }
  }
  
  private removeValue(obj: Record<string, unknown>, path: string[]): void {
    const key = path[path.length - 1]
    if (!key) return
    const parent = this.resolvePath(obj, path.slice(0, -1))
    if (parent) {
      delete parent[key]
    }
  }
  
  private replaceValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
    const key = path[path.length - 1]
    if (!key) return
    const parent = this.resolvePath(obj, path.slice(0, -1))
    if (parent) {
      parent[key] = value
    }
  }
  
  private resolvePath(obj: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
    let current: unknown = obj
    for (const segment of path) {
      if (!current || typeof current !== 'object' || current === null || Array.isArray(current)) {
        return null
      }
      current = (current as Record<string, unknown>)[segment]
    }
    
    // Ensure the final value is a record (not a primitive or array)
    if (!current || typeof current !== 'object' || current === null || Array.isArray(current)) {
      return null
    }
    
    return current as Record<string, unknown>
  }
}