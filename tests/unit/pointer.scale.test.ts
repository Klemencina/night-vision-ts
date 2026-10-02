import { describe, expect, it, vi } from 'vitest'
import Input from '../../src/core/input/pointer'

describe('dragging the selected vertical scale', () => {
    it.each([false, true])('uses logarithmic coordinates with pane logScale=%s', paneLog => {
        const input = new Input()
        const emit = vi.fn()
        input.layout = {
            width: 200, height: 100, $hi: 99, $lo: 0,
            A: -100 / Math.log(100), B: 100,
            scaleIndex: 'right', scaleSpecs: { log: true },
            settings: { logScale: paneLog }, ti: t => t
        } as typeof input.layout
        input.range = [0, 100]
        input.gridId = 0
        input.meta = { getYtransform: () => ({ auto: false }) }
        input.events = { emit }
        input.drug = {
            x: 0, y: 0, r: [0, 100], t: 100, o: 0,
            y_r: [99, 0], B: 100, t0: 0, recentMoves: []
        }

        input.mousedrag(0, 10, true)

        const transform = emit.mock.calls[0][1]
        expect(transform.scaleId).toBe('right')
        expect(transform.range[0]).toBeCloseTo(157.48931924611142)
        expect(transform.range[1]).toBeCloseTo(0.5848931924611136)
    })

    it('keeps a linear scale linear when the pane defaults to logarithmic', () => {
        const input = new Input()
        const emit = vi.fn()
        input.layout = {
            width: 200, height: 100, $hi: 100, $lo: 0, A: -1, B: 100,
            scaleIndex: 'left', scaleSpecs: { log: false },
            settings: { logScale: true }, ti: t => t
        } as typeof input.layout
        input.range = [0, 100]
        input.gridId = 0
        input.meta = { getYtransform: () => ({ auto: false }) }
        input.events = { emit }
        input.drug = {
            x: 0, y: 0, r: [0, 100], t: 100, o: 0,
            y_r: [100, 0], B: 100, t0: 0, recentMoves: []
        }

        input.mousedrag(0, 10, true)

        expect(emit.mock.calls[0][1].range).toEqual([110, 10])
    })
})
