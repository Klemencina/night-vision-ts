import { describe, expect, it, vi } from 'vitest'
import GridMaker from '../../src/core/gridMaker'
import Const from '../../src/stuff/constants'

vi.mock('../../src/core/scripts', () => ({ default: { instance: () => ({ prefabs: {} }) } }))
vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => ({
    getPreSampler: () => undefined,
    getAutoPrec: () => undefined,
    setAutoPrec: () => {}
}) } }))

function makeGrid(data: number[][], indexBased: boolean) {
    const interval = indexBased ? 1 : Const.MINUTE
    const start = indexBased ? 0 : 1700000040000
    const range: [number, number] = [start - interval, start + 20 * Const.DAY / Const.MINUTE * interval]
    const hub = {
        indexBased,
        panes: () => [{ overlays: [{ id: 0, settings: {}, dataSubset: data }] }],
        mainOv: { dataSubset: data, dataView: { src: data, i1: 0, i2: data.length - 1 } }
    }
    const grid = GridMaker(0, {
        hub,
        meta: { ohlc: () => undefined },
        props: {
            interval,
            timeFrame: Const.MINUTE,
            range,
            timezone: 0,
            width: 1000,
            config: Const.ChartConfig,
            ...{ id: 'grid-maker-test', ctx: { measureText: () => ({ width: 50 }) } }
        },
        settings: {},
        height: 300
    })
    grid.setMaxSidebar([0, 50])
    return { layout: grid.create(), range, interval }
}

describe('horizontal positions for sparse views', () => {
    it.each([false, true])('keeps one candle drawable with indexBased=%s', indexBased => {
        const data = [[1700000040000, 100, 102, 98, 101, 5]]
        const { layout, range, interval } = makeGrid(data, indexBased)
        expect(layout.spacex).toBe(950)
        expect(layout.pxStep).toBe(950 * interval / (range[1] - range[0]))
        expect(Number.isFinite(layout.startx)).toBe(true)
        const x = (layout as unknown as { ti2x: (t: number, i: number) => number }).ti2x(data[0][0], 0)
        expect(Number.isFinite(x)).toBe(true)
    })
})
