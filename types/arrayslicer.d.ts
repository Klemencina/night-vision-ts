declare module 'arrayslicer' {
    export interface IndexedArrayPosition {
        found: boolean
        index: number
        prev: number | null
        next: number | null
    }
    
    export default class IndexedArray<T extends Record<string, unknown>> {
        data: T[]
        index: string
        cursor: number | null
        nextlow: number | null
        nexthigh: number | null
        valpos: Record<string, IndexedArrayPosition>
        
        constructor(data: T[], index: string)
        getRange(start: number, end: number): T[]
        fetch(value: number): void
    }
}
