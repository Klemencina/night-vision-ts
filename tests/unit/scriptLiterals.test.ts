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
    it.each([
        ['keyword property division', `const obj = {return: 4}; const value = obj.return / 2; Spline(sma(close, 1)[0] / value)`, 2],
        ['optional keyword property division', `const obj = {return: 4}; const value = obj?.return / 2; Spline(sma(close, 1)[0] / value)`, 2],
        ['Unicode identifier division', `const цена𐐀 = 4; const value = цена𐐀 / 2; Spline(sma(close, 1)[0] / value)`, 2],
        ['regex after a statement block', `if (true) {} /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['regex after else', `if (false) {} else /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['object expression division', `const value = {} / 2; if (!Number.isNaN(value)) throw new Error('Division changed'); Spline(sma(close, 1)[0])`, 4],
        ['function expression division', `const value = function() {} / 2; if (!Number.isNaN(value)) throw new Error('Division changed'); Spline(sma(close, 1)[0])`, 4],
        ['async function expression division', `const value = async function() {} / 2; if (!Number.isNaN(value)) throw new Error('Division changed'); Spline(sma(close, 1)[0])`, 4],
        ['keyword object keys', `const value = {function: 1, class: 2} / 2; if (!Number.isNaN(value)) throw new Error('Division changed'); Spline(sma(close, 1)[0])`, 4],
        ['ternary object division', `const value = false ? 0 : {} / 2; Spline(sma(close, 1)[0])`, 4],
        ['ternary function division', `const value = false ? 0 : function() {} / 2; Spline(sma(close, 1)[0])`, 4],
        ['ternary class division', `const value = false ? 0 : class {} / 2; Spline(sma(close, 1)[0])`, 4],
        ['nested ternary division', `const value = false ? true ? 1 : 2 : false ? 3 : {} / 2; Spline(sma(close, 1)[0])`, 4],
        ['object key inside a ternary', `const value = false ? {key: 1} : {} / 2; Spline(sma(close, 1)[0])`, 4],
        ['optional chaining before a label', `const obj = {}; const value = obj?.key; label: {} /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['nullish coalescing before a switch case', `const value = null ?? 1; switch (value) { case 1: {} /"/.test('"'); } Spline(sma(close, 1)[0])`, 4],
        ['ternary in a switch case', `switch (1) { case true ? 1 : 0: {} /"/.test('"'); } Spline(sma(close, 1)[0])`, 4],
        ['regex after a function declaration', `function noop() {} /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['regex after adjacent blocks', `if (true) {} {} /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['regex after a catch block', `try {} catch {} /"/.test('"'); Spline(sma(close, 1)[0])`, 4],
        ['nested block in a template expression', 'Spline(close[0], {name: `${(() => { if (true) {} /"/.test(\'"\'); return sma(close, 1)[0] })()}`})', 4]
    ])('executes %s without hiding following indicator calls', async (_name, update, value) => {
        ;(self as any).scriptLib.iScripts.Test = { code: { update } }
        await se.exec_all()
        expect((self as any).paneStruct[0].overlays[0]?.data).toEqual([[0, value]])
    })

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
