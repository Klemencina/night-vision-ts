import { describe, expect, it } from 'vitest'
import { copyOverlay, copyOverlayPoint, copyIndicator, copyPane, findTarget, type OverlayInput } from '../../src/core/paneData'

describe('pane and overlay inputs', () => {
    it('copies nested caller-owned data without limiting custom overlay values to numbers', () => {
        const input: OverlayInput = {
            type: 'Custom',
            data: [[1, null, { label: 'first' }], [2, NaN, ['second']]],
            props: { style: { color: 'red' } }
        }
        const copy = copyOverlay(input, true)
        copy.data![0][2].label = 'changed'
        copy.props!.style.color = 'blue'
        expect(input.data![0][2]).toEqual({ label: 'first' })
        expect(input.props!.style).toEqual({ color: 'red' })
        expect(copy.data![1][1]).toBeNaN()
    })

    it.each([
        { type: 'Candles', data: [[1, 1]] },
        { type: 'CandlesPlus', data: [[1, 1, 2, 0, 1, -1]] },
        null, { type: '' }, { type: 42 }, { name: null }, { main: 1 },
        { props: [] }, { settings: null }, { uuid: 'internal' }, { prod: true },
        { data: null }, { data: [null] }, { data: [[NaN, 1]] },
        { data: [[1, 1], [1, 2]] }, { data: [[2, 1], [1, 2]] },
        { data: new Array(2) }
    ])('rejects invalid overlay input %j', input => {
        expect(() => copyOverlay(input as never)).toThrow()
    })

    it('rejects missing types, internal pane fields, and ambiguous main overlays', () => {
        expect(() => copyOverlay({}, true)).toThrow('type')
        expect(() => copyPane({ id: 2 } as never)).toThrow('field')
        expect(() => copyPane({ overlays: new Array(1) })).toThrow('plain object')
        expect(() => copyPane({ overlays: [{ type: 'Spline' }] }, true)).toThrow('field')
        expect(() => copyPane({ overlays: [
            { type: 'Spline', main: true }, { type: 'Candles', main: true }
        ] })).toThrow('one main')
    })

    it('uses exact UUIDs or valid integer positions', () => {
        const items = [{ uuid: '1' }, { uuid: 'other' }]
        expect(findTarget(items, '1', 'Pane')).toBe(items[0])
        expect(findTarget(items, 1, 'Pane')).toBe(items[1])
        for (const target of [-1, 0.5, NaN, {}, null]) {
            expect(() => findTarget(items, target as never, 'Pane')).toThrow(TypeError)
        }
        expect(() => findTarget(items, 'missing', 'Pane')).toThrow(RangeError)
    })
})


describe('indicator and streaming input', () => {
    it('copies indicator properties and validates public definition fields', () => {
        const input = { type: 'SMA', props: { length: 5, custom: { value: 1 } } }
        const copied = copyIndicator(input, true)
        copied.props!.custom.value = 2
        expect(input.props.custom.value).toBe(1)
        for (const invalid of [null, {}, { type: '' }, { type: 1 }, { type: 'SMA', uuid: 'internal' },
            { type: 'SMA', props: null }, { type: 'SMA', settings: [] }, { type: 'SMA', name: 1 }]) {
            expect(() => copyIndicator(invalid as never, true)).toThrow(TypeError)
        }
        expect(() => copyIndicator({ props: { callback: () => {} } })).toThrow()
    })

    it('copies a generic point including nested values and rejects invalid timestamps', () => {
        const row = [1, { label: 'original' }, null] as const
        const copy = copyOverlayPoint(row)
        ;(copy[1] as { label: string }).label = 'changed'
        expect(row[1].label).toBe('original')
        for (const invalid of [null, [], [NaN, 1], [Infinity, 1], ['1', 2], new Array(2)]) {
            expect(() => copyOverlayPoint(invalid as never)).toThrow(TypeError)
        }
    })
})
