import { describe, expect, it, vi } from 'vitest'
import Scale from '../../src/core/gridScale'
import Const from '../../src/stuff/constants'

vi.mock('../../src/core/scripts', () => ({ default: { instance: () => ({ prefabs: {} }) } }))
vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => ({
    getPreSampler: () => undefined,
    getAutoPrec: () => undefined,
    setAutoPrec: () => {}
}) } }))

describe('flat linear scales', () => {
    it.each([0, -10, 10])('keeps %s centered with a finite, correctly oriented transform', value => {
        const scale = Scale('A', {
            id: 'A', gridId: 0, log: false, ovIdxs: [0],
            ovs: [{ id: 0, settings: {}, dataSubset: [[0, value], [1, value]] }]
        }, {
            height: 300,
            props: {
                id: 'flat-scale', config: Const.ChartConfig,
                ctx: { measureText: () => ({ width: 50 }) } as unknown as CanvasRenderingContext2D
            }
        })

        expect(scale.$hi).toBeGreaterThan(value)
        expect(scale.$lo).toBeLessThan(value)
        expect(Number.isFinite(scale.A)).toBe(true)
        expect(Number.isFinite(scale.B)).toBe(true)
        expect(scale.A).toBeLessThan(0)
        expect(value * scale.A + scale.B).toBeCloseTo(150)
        expect(scale.ys.every(([y, price]) => Number.isFinite(y) && Number.isFinite(price))).toBe(true)
    })
})
