import { describe, expect, it } from 'vitest'
import { copyCandle, copySeries, type Candle } from '../../src/core/candleData'

describe('candle input', () => {
    it('accepts readonly OHLC and OHLCV rows and copies caller data', () => {
        const rows: readonly Candle[] = [
            [0, -2, 0, -4, -1],
            [60000, 1, 3, 0, 2, 0]
        ]
        const copy = copySeries(rows)
        expect(copy).toEqual(rows)
        expect(copy).not.toBe(rows)
        expect(copy[0]).not.toBe(rows[0])
        copy[0][4] = -3
        expect(rows[0][4]).toBe(-1)
        expect(copySeries([])).toEqual([])
    })

    it.each(
        [
            null,
            [0, 1, 2],
            [0, 1, 2, 0, 1, 2, 3],
            [0, 1, Infinity, 0, 1],
            [NaN, 1, 2, 0, 1],
            [0, '1', 2, 0, 1],
            [0, 1, 2, 0, undefined],
            new Array(5)
        ].map(row => ({ row }))
    )('rejects malformed or non-finite input $row', ({ row }) => {
        expect(() => copyCandle(row as unknown as Candle)).toThrow(TypeError)
    })

    it.each(
        [
            [0, 1, 0, 0, 1],
            [0, 1, 2, 2, 1],
            [0, 1, 2, 0, 3],
            [0, 1, 2, 0, 1, -1]
        ].map(row => ({ row }))
    )('rejects inconsistent prices or negative volume $row', ({ row }) => {
        expect(() => copyCandle(row as unknown as Candle)).toThrow(RangeError)
    })

    it('rejects duplicate and descending timestamps without changing input', () => {
        const first: Candle = [60000, 1, 2, 0, 1]
        const before: Candle = [0, 1, 2, 0, 1]
        expect(() => copySeries([first, first])).toThrow('strictly increasing')
        expect(() => copySeries([first, before])).toThrow('strictly increasing')
        expect(first).toEqual([60000, 1, 2, 0, 1])
        expect(() => copySeries(null as unknown as Candle[])).toThrow(TypeError)
    })
})
