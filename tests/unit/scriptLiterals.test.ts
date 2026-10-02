import { beforeEach, describe, expect, it, vi } from 'vitest'
import se from '../../src/core/se/script_engine'

beforeEach(() => {
    Object.assign(se, {
        data: { ohlcv: { id: 'ohlcv', data: [[0, 1, 1, 1, 4, 1]] } },
        map: {}, queue: [], delta_queue: [], update_queue: [], mods: {}, sett: {},
        tf: 60000, running: false, _restart: false, send: vi.fn()
    })
    Object.assign(self, {
        scriptLib: { prefabs: { Spline: {} }, iScripts: {} },
        paneStruct: [{ uuid: 'pane', scripts: [{ uuid: 'a', type: 'Test', props: {} }], overlays: [] }]
    })
})

describe('indicator string literals', () => {
    it('keeps regex literals and division executable around quoted text', async () => {
        ;(self as any).scriptLib.iScripts.Test = { code: {
            update: `
                const matches = /"/.test('"') && /[\\/\x60}]/.test('}')
                let divisor = 2
                const divided = divisor++ / 2
                if (matches) /"/.test('"')
                Spline(sma(close, 1)[0] / 2, {name: matches ? 'matched' : 'missed'})
                if (divided !== 1) throw new Error('Postfix division changed')
            `
        } }
        await se.exec_all()
        const overlay = (self as any).paneStruct[0].overlays[0]
        expect(overlay.name).toBe('matched')
        expect(overlay.data).toEqual([[0, 2]])
    })

    it.each([
        ['"ema(close, 3) Spline(close[10])"', 'ema(close, 3) Spline(close[10])'],
        ["'ema(close, 3) )'", 'ema(close, 3) )'],
        ['"escaped \\\"quote\\\" ema(close, 3)"', 'escaped "quote" ema(close, 3)'],
        ['`ema(close, 3) ${sma(close, 1)[0]} Spline(close[10])`', 'ema(close, 3) 4 Spline(close[10])'],
        ['`outer ${`inner ema(close, 3) ${sma(close, 1)[0]}`} )`', 'outer inner ema(close, 3) 4 )'],
        ['`regex ${/[\x60}]/.test("}") ? sma(close, 1)[0] : 0} ema(close, 3)`', 'regex 4 ema(close, 3)']
    ])('preserves label %s while executing code', async (literal, expected) => {
        ;(self as any).scriptLib.iScripts.Test = { code: {
            update: `Spline(sma(close, 1)[0], {name: ${literal}})`
        } }
        await se.exec_all()
        const overlay = (self as any).paneStruct[0].overlays[0]
        expect(overlay.name).toBe(expected)
        expect(overlay.data).toEqual([[0, 4]])
    })
})
