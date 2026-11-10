import { describe, expect, it } from 'vitest'
import { captureChartState, copyChartState, restoreChartData } from '../../src/core/chartState'
import type { Data } from '../../src/core/dataHub'

function fixture() {
    const rows = [[60000, 1, 2, 0, 1, 5], [120000, 1, 3, 0, 2, 7]]
    const data: Data = { indexBased: true, panes: [{
        uuid: 'pane', settings: { height: 2, scaleSideIdxs: [undefined, 'A'] },
        overlays: [
            { uuid: 'candles', type: 'Candles', main: true, data: rows, dataSubset: rows,
                dataExt: { lines: [{ uuid: 'line', p1: [60000, 1], p2: [120000, 2] }] } },
            { uuid: 'derived', type: 'Spline', prod: 'sma', data: [[60000, NaN]] }
        ],
        scripts: [{ uuid: 'sma', type: 'SMA', props: { length: 5 }, settings: { indicatorProps: { length: 5 } } }]
    }] }
    const appearance = { colors: { back: '#101010' }, config: { LEGEND_COLLAPSED: true }, timezone: 2, showLogo: false }
    const snapshot = (includeData = false) => captureChartState(data, appearance, [0, 8],
        [{ A: { auto: false, range: [10, -2], gridId: 0, scaleId: 'A' } }], includeData)
    return { data, rows, snapshot }
}

describe('chart state format', () => {
    it('exports detached JSON state without runtime objects or market data by default', () => {
        const { data, rows, snapshot } = fixture()
        const state = snapshot()
        expect(state.version).toBe(1)
        expect(state.panes[0].overlays).toHaveLength(1)
        expect(state.panes[0].overlays[0].data).toBeUndefined()
        expect(state.panes[0].overlays[0]).not.toHaveProperty('dataSubset')
        expect(state.panes[0].settings.scaleSideIdxs).toEqual([null, 'A'])
        expect(state.panes[0].scales).toEqual({ A: { auto: false, range: [10, -2] } })
        expect(copyChartState(JSON.parse(JSON.stringify(state)))).toEqual(state)
        state.panes[0].scripts[0].props!.length = 100
        expect(data.panes![0].scripts![0].props!.length).toBe(5)
        const included = snapshot(true)
        expect(included.panes[0].overlays[0].data).toEqual(rows)
        expect(included.panes[0].overlays[0].data).not.toBe(rows)
    })

    it('retains omitted source data by UUID or main-series role and uses explicitly saved data', () => {
        const { data, rows, snapshot } = fixture()
        expect(restoreChartData(snapshot(), data).panes![0].overlays![0].data).toBe(rows)
        const other: Data = { panes: [{ overlays: [{ uuid: 'other', type: 'Candles', main: true, data: rows }] }] }
        expect(restoreChartData(snapshot(), other).panes![0].overlays![0].data).toBe(rows)
        const full = snapshot(true)
        full.panes[0].overlays[0].data = []
        expect(restoreChartData(full, data).panes![0].overlays![0].data).toEqual([])
        expect(restoreChartData(snapshot(), {}).panes![0].overlays![0].data).toEqual([])
    })

    it.each([
        ['version', (state: any) => { state.version = 2 }],
        ['range', (state: any) => { state.range = [4, 4] }],
        ['duplicate UUID', (state: any) => { state.panes[0].scripts[0].uuid = 'candles' }],
        ['manual scale', (state: any) => { state.panes[0].scales.A.range = [-2, 10] }],
        ['price data', (state: any) => { state.panes[0].overlays[0].data = [[0, 1, 0, 0, 2]] }],
        ['boolean', (state: any) => { state.indexBased = 'true' }],
        ['container identity', (state: any) => { state.appearance.id = 'other-chart' }],
        ['unknown data source', (state: any) => { state.panes[0].overlays[0].dataSource = 'missing' }],
        ['cyclic data source', (state: any) => { state.panes[0].overlays[0].dataSource = 'candles' }]
    ])('rejects invalid %s before restoration', (_label, mutate) => {
        const state = fixture().snapshot()
        mutate(state)
        expect(() => copyChartState(state)).toThrow()
    })

    it('rejects values that JSON would silently lose or change', () => {
        const state = fixture().snapshot()
        state.panes[0].overlays[0].props = { formatter: () => 'x' }
        expect(() => copyChartState(state)).toThrow('JSON values')
        state.panes[0].overlays[0].props = { price: Infinity }
        expect(() => copyChartState(state)).toThrow('JSON values')
        const cyclic: Record<string, unknown> = {}
        cyclic.self = cyclic
        state.panes[0].overlays[0].props = cyclic
        expect(() => copyChartState(state)).toThrow('cycle')
    })

    it.each([false, true])('preserves candle/volume sharing through JSON with includeData=%s', includeData => {
        const { data, rows, snapshot } = fixture()
        data.panes![0].overlays!.unshift({ uuid: 'volume', type: 'Volume', data: rows })
        const state = copyChartState(JSON.parse(JSON.stringify(snapshot(includeData))))
        expect(state.panes[0].overlays[0].dataSource).toBe('candles')
        const restored = restoreChartData(state, includeData ? {} : data)
        const [volume, candles] = restored.panes![0].overlays!
        expect(volume.data).toBe(candles.data)
        expect(candles.data).toEqual(rows)
    })
})
