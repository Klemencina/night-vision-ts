import { describe, it, expect } from 'vitest'
import Utils from '../../src/stuff/utils'

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

    describe('fastFilter', () => {
        it('should filter data by time range', () => {
            const data = [
                [1000, 1],
                [2000, 2],
                [3000, 3],
                [4000, 4]
            ]
            const [result, index] = Utils.fastFilter(data, 1500, 3500)
            expect(Array.isArray(result)).toBe(true)
        })
        
        it('should handle empty data', () => {
            const [result, index] = Utils.fastFilter([], 1000, 2000)
            expect(result).toEqual([])
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
