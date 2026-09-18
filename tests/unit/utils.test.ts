import { describe, it, expect } from 'vitest'
import Utils, { lowerBound, upperBound } from '../../src/stuff/utils'
import DataView from '../../src/core/dataView'

describe('Utils TypeScript Migration', () => {
    
    describe('clamp', () => {
        it('should clamp value within range', () => {
            expect(Utils.clamp(5, 0, 10)).toBe(5)
            expect(Utils.clamp(-5, 0, 10)).toBe(0)
            expect(Utils.clamp(15, 0, 10)).toBe(10)
        })
        
        it('should handle edge cases', () => {
            expect(Utils.clamp(0, 0, 10)).toBe(0)
            expect(Utils.clamp(10, 0, 10)).toBe(10)
        })
    })

    describe('addZero', () => {
        it('should add leading zero to single digit', () => {
            expect(Utils.addZero(5)).toBe('05')
            expect(Utils.addZero(9)).toBe('09')
        })
        
        it('should not add zero to double digits', () => {
            expect(Utils.addZero(10)).toBe('10')
            expect(Utils.addZero(99)).toBe('99')
        })
    })

    describe('round', () => {
        it('should round to specified decimals', () => {
            expect(Utils.round(3.14159, 2)).toBe(3.14)
            expect(Utils.round(3.14159, 0)).toBe(3)
            expect(Utils.round(3.999, 2)).toBe(4)
        })
    })

    describe('strip', () => {
        it('should strip floating point errors', () => {
            expect(Utils.strip(0.1 + 0.2)).not.toBe(0.30000000000000004)
            expect(Utils.strip(0.1 + 0.2)).toBeCloseTo(0.3, 10)
        })
    })

    describe('detectTimeframe', () => {
        it('should detect timeframe from data', () => {
            const data = [
                [1000, 1, 2, 3, 4],
                [2000, 2, 3, 4, 5],
                [3000, 3, 4, 5, 6]
            ]
            expect(Utils.detectTimeframe(data)).toBe(1000)
        })
        
        it('should return Infinity for empty data', () => {
            expect(Utils.detectTimeframe([])).toBe(Infinity)
        })
    })

    describe('time-series searches', () => {
        it('finds the nearest timestamp while keeping the first row for duplicates and ties', () => {
            const data = [[0, 0], [10, 1], [10, 2], [20, 3], [20, 4], [30, 5]]
            const cases = [[-20, 0], [0, 0], [5, 0], [10, 1], [15, 1], [20, 3], [25, 3], [30, 5], [100, 5]]

            for (const [time, index] of cases) {
                expect(Utils.nearestTs(time, data)).toEqual([index, data[index]])
            }
            expect(Utils.nearestTs(0, [])).toEqual([-1, null])
            for (const time of [NaN, -Infinity, Infinity]) {
                expect(Utils.nearestTs(time, data)).toEqual([-1, null])
            }
            expect(Utils.nearestTs(0, [[-Infinity], [Infinity]])).toEqual([-1, null])
        })

        it('includes exact bounds and duplicate timestamps with the correct source index', () => {
            const data = [[0, 1], [10, 2], [10, 3], [20, 4]]

            expect(Utils.fastFilter(data, 0, 10)).toEqual([data.slice(0, 3), 0])
            expect(Utils.fastFilter(data, 10, 10)).toEqual([data.slice(1, 3), 1])
            expect(Utils.fastFilter(data, 5, 15)).toEqual([data.slice(1, 3), 1])
            expect(lowerBound(data, 10)).toBe(1)
            expect(upperBound(data, 10)).toBe(3)
        })

        it('preserves DataView neighbors at exact, missing, and outside bounds', () => {
            const data = [[10, 1], [20, 2], [30, 3], [40, 4]]
            const cases = [
                { range: [20, 30], indices: [1, 3], subset: data },
                { range: [21, 29], indices: [2, 2], subset: data.slice(1, 3) },
                { range: [-10, 0], indices: [0, 0], subset: data.slice(0, 1) },
                { range: [50, 60], indices: [4, 4], subset: data.slice(3) },
                { range: [-Infinity, Infinity], indices: [0, 4], subset: data }
            ]

            for (const { range, indices, subset } of cases) {
                const result = Utils.fastFilter2(data, range[0], range[1])
                expect(result).toEqual(indices)
                const view = new DataView(data, ...result)
                expect(view.makeSubset()).toEqual(subset)
                expect(view.length).toBe(subset.length)
            }
            expect(Utils.fastFilter(data, 21, 29)).toEqual([[], undefined])
            expect(Utils.fastFilter(data, 50, 60)).toEqual([[], undefined])
        })

        it('returns empty results for empty input and invalid ranges', () => {
            const data = [[10, 1], [20, 2]]
            const cases: [number[][], number, number][] = [
                [[], 0, 30],
                [data, 20, 10],
                [data, NaN, 20],
                [data, 10, NaN]
            ]

            for (const [source, start, end] of cases) {
                expect(Utils.fastFilter(source, start, end)).toEqual([[], undefined])
                const view = new DataView(source, ...Utils.fastFilter2(source, start, end))
                expect(view.makeSubset()).toEqual([])
                expect(view.length).toBe(0)
            }
        })

        it('keeps exact-match and missing-neighbor semantics', () => {
            const data = [[0, 1], [10, 2], [10, 3], [20, 4]]

            expect(Utils.fastNearest(data, 0)).toEqual([null, null])
            expect(Utils.fastNearest(data, 10)).toEqual([null, null])
            expect(Utils.fastNearest(data, 5)).toEqual([0, 1])
            expect(Utils.fastNearest(data, 15)).toEqual([2, 3])
            expect(Utils.fastNearest(data, -1)).toEqual([null, 0])
            expect(Utils.fastNearest(data, 21)).toEqual([3, null])
            expect(Utils.fastNearest(data, NaN)).toEqual([null, null])
            expect(Utils.fastNearest([], 10)).toEqual([null, null])
        })

        it('reflects timestamp changes and row replacements without length or endpoint changes', () => {
            const data = [[10, 1], [20, 2], [30, 3], [40, 4], [50, 5]]

            expect(Utils.fastFilter2(data, 25, 35)).toEqual([2, 3])
            expect(Utils.fastNearest(data, 35)).toEqual([2, 3])
            data[2][0] = 39
            expect(Utils.fastFilter2(data, 25, 35)).toEqual([2, 2])
            expect(Utils.fastFilter(data, 25, 35)).toEqual([[], undefined])
            expect(Utils.fastNearest(data, 35)).toEqual([1, 2])
            data[2] = [32, 9]
            expect(Utils.fastFilter(data, 25, 35)).toEqual([[data[2]], 2])
            expect(Utils.fastNearest(data, 35)).toEqual([2, 3])
        })
    })

    describe('findIndexOffset', () => {
        it('finds either offset direction and restarts agreement after a gap', () => {
            const main = [0, 1, 2, 3, 4, 5].map(t => [t, t])
            expect(Utils.findIndexOffset(main, main.slice(2))).toBe(2)
            expect(Utils.findIndexOffset(main.slice(2), main)).toBe(-2)
            expect(Utils.findIndexOffset(main, [0, 2, 3, 4, 5].map(t => [t, t]))).toBe(1)
        })

        it('matches the last duplicate without counting one timestamp multiple times', () => {
            const main = [0, 10, 10, 20, 20, 30, 30].map(t => [t, t])
            expect(Utils.findIndexOffset(main, main.slice(1))).toBe(1)
            expect(Utils.findIndexOffset(main, [[10, 1], [10, 2], [10, 3]])).toBe(0)
            expect(Utils.findIndexOffset(main, [[100, 1], [110, 2], [120, 3]])).toBe(0)
            expect(Utils.findIndexOffset([], main)).toBe(0)
            expect(Utils.findIndexOffset(main, [])).toBe(0)
        })
    })

    describe('uuid', () => {
        it('should generate valid UUID format', () => {
            const uuid = Utils.uuid()
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        })
        
        it('should generate unique UUIDs', () => {
            const uuid1 = Utils.uuid()
            const uuid2 = Utils.uuid()
            expect(uuid1).not.toBe(uuid2)
        })
    })

    describe('uuid2', () => {
        it('should generate short UUID', () => {
            const uuid = Utils.uuid2()
            expect(typeof uuid).toBe('string')
            expect(uuid.length).toBe(12)
        })
    })

    describe('uuid3', () => {
        it('should generate numeric UUID', () => {
            const uuid = Utils.uuid3()
            expect(typeof uuid).toBe('string')
            expect(parseInt(uuid)).not.toBeNaN()
        })
    })

    describe('formatCash', () => {
        it('should format small values', () => {
            expect(Utils.formatCash(500)).toBe('500')
            expect(Utils.formatCash(999)).toBe('999')
        })
        
        it('should format thousands with K', () => {
            expect(Utils.formatCash(1500)).toContain('K')
            expect(Utils.formatCash(999000)).toContain('K')
        })
        
        it('should format millions with M', () => {
            expect(Utils.formatCash(1500000)).toContain('M')
            expect(Utils.formatCash(999000000)).toContain('M')
        })
        
        it('should format billions with B', () => {
            expect(Utils.formatCash(1500000000)).toContain('B')
        })
        
        it('should handle undefined', () => {
            expect(Utils.formatCash(undefined)).toBe('x')
        })
    })

    describe('parseTf', () => {
        it('should parse timeframe strings', () => {
            expect(Utils.parseTf('1m')).toBe(60000)
            expect(Utils.parseTf('1H')).toBe(3600000)
            expect(Utils.parseTf('1D')).toBe(86400000)
        })
        
        it('should pass through numbers', () => {
            expect(Utils.parseTf(60000)).toBe(60000)
            expect(Utils.parseTf(3600000)).toBe(3600000)
        })
        
        it('should return undefined for unknown strings', () => {
            expect(Utils.parseTf('unknown')).toBeUndefined()
        })
    })

    describe('now', () => {
        it('should return current timestamp', () => {
            const before = Date.now()
            const now = Utils.now()
            const after = Date.now()
            expect(now).toBeGreaterThanOrEqual(before)
            expect(now).toBeLessThanOrEqual(after)
        })
    })

    describe('pause', () => {
        it('should pause for specified time', async () => {
            const start = Date.now()
            await Utils.pause(50)
            const end = Date.now()
            expect(end - start).toBeGreaterThanOrEqual(45)
        })
    })

    describe('smartWheel', () => {
        it('should limit large delta values', () => {
            expect(Utils.smartWheel(600)).toBeLessThan(600)
            expect(Utils.smartWheel(-600)).toBeGreaterThan(-600)
        })
        
        it('should pass through small values', () => {
            expect(Utils.smartWheel(100)).toBe(100)
            expect(Utils.smartWheel(-100)).toBe(-100)
        })
    })

    describe('dayStart', () => {
        it('should return start of day', () => {
            const timestamp = Date.now()
            const dayStart = Utils.dayStart(timestamp)
            const date = new Date(dayStart)
            expect(date.getUTCHours()).toBe(0)
            expect(date.getUTCMinutes()).toBe(0)
            expect(date.getUTCSeconds()).toBe(0)
        })
    })

    describe('monthStart', () => {
        it('should return start of month', () => {
            const timestamp = Date.now()
            const monthStart = Utils.monthStart(timestamp)
            const date = new Date(monthStart)
            expect(date.getUTCDate()).toBe(1)
            expect(date.getUTCHours()).toBe(0)
        })
    })

    describe('yearStart', () => {
        it('should return start of year', () => {
            const timestamp = new Date('2024-06-15').getTime()
            const yearStart = Utils.yearStart(timestamp)
            const date = new Date(yearStart)
            expect(date.getUTCFullYear()).toBe(2024)
            expect(date.getUTCMonth()).toBe(0)
            expect(date.getUTCDate()).toBe(1)
        })
    })

    describe('nearestA', () => {
        it('should find nearest value in array', () => {
            const arr = [1, 5, 10, 15, 20]
            const [index, value] = Utils.nearestA(7, arr)
            expect(value).toBe(5)
            expect(index).toBe(1)
        })
    })

    describe('allOverlays', () => {
        it('should flatten overlays from panes', () => {
            const panes = [
                { uuid: '1', overlays: [{ type: 'a' }] },
                { uuid: '2', overlays: [{ type: 'b' }] }
            ]
            const result = Utils.allOverlays(panes)
            expect(result).toHaveLength(2)
        })
        
        it('should handle panes without overlays', () => {
            const panes = [
                { uuid: '1' },
                { uuid: '2', overlays: [{ type: 'b' }] }
            ]
            const result = Utils.allOverlays(panes as any)
            expect(result).toHaveLength(1)
        })
    })

    describe('formatName', () => {
        it('should format overlay name with settings', () => {
            const ov = {
                name: 'RSI $length',
                settings: { length: 14 }
            }
            expect(Utils.formatName(ov)).toBe('RSI 14')
        })
        
        it('should return undefined for missing name', () => {
            const ov = { settings: { length: 14 } }
            expect(Utils.formatName(ov as any)).toBeUndefined()
        })
    })
})
