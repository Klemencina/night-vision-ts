import { afterEach, describe, expect, it, vi } from 'vitest'
import DataHub from '../../src/core/dataHub'
import Events from '../../src/core/events'
import MetaHub from '../../src/core/metaHub'

function setup(id: string) {
    const hub = DataHub.instance(id)
    hub.init({
        panes: [
            {
                overlays: [{ type: 'main', data: [[1, 2, 3, 1, 2]], main: true }],
                settings: {}
            }
        ]
    })
    hub.calcSubset([0, 2])
    hub.detectMain()

    const events = Events.instance(id)
    const meta = MetaHub.instance(id)
    return { events, meta, hub }
}

describe('MetaHub lifecycle refresh', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('resolves OHLC after revisions, prepends, and replacement while preserving map snapshots', () => {
        const { meta, hub } = setup('meta-ohlc')
        const rows = [[0, 1, 2, 0, 1], [10, 2, 3, 1, 2], [10, 3, 4, 2, 3]]
        hub.mainOv!.data = rows
        meta.ohlcFn = row => row.slice(1, 5) as [number, number, number, number]
        meta.calcOhlcMap()
        const snapshot = meta.ohlcMap
        expect(meta.ohlc(0)).toEqual([1, 2, 0, 1])
        expect(meta.ohlc(10)).toEqual([3, 4, 2, 3])
        expect(meta.ohlc(5)).toBeUndefined()
        expect(snapshot[10]).toEqual({ ref: rows[2], index: 2 })

        rows[1] = [5, 8, 9, 7, 8]
        rows.unshift([-10, 4, 5, 3, 4])
        meta.calcOhlcMap()
        expect(meta.ohlc(5)).toEqual([8, 9, 7, 8])
        expect(meta.ohlcMap[10].index).toBe(3)
        expect(snapshot[10].index).toBe(2)

        hub.mainOv!.data = [[20, 5, 6, 4, 5]]
        meta.calcOhlcMap()
        expect(meta.ohlc(10)).toBeUndefined()
        expect(meta.ohlc(20)).toEqual([5, 6, 4, 5])
        expect(Object.keys(meta.ohlcMap)).toEqual(['20'])
        MetaHub.release('meta-ohlc')
        DataHub.release('meta-ohlc')
        Events.release('meta-ohlc')
    })

    it('emits one deferred refresh after current metadata extraction finishes', () => {
        vi.useFakeTimers()
        const { events, meta } = setup('meta-current-refresh')
        const updateLayout = vi.fn()
        const updateLegend = vi.fn()

        events.on('chart:update-layout', updateLayout)
        events.on('legend:update-legend', updateLegend)

        meta.init({})
        meta.finish()
        vi.runOnlyPendingTimers()

        expect(updateLayout).toHaveBeenCalledTimes(1)
        expect(updateLegend).toHaveBeenCalledTimes(1)
    })

    it('does not emit a stale deferred refresh after metadata is reinitialized', () => {
        vi.useFakeTimers()
        const { events, meta } = setup('meta-stale-refresh')
        const updateLayout = vi.fn()
        const updateLegend = vi.fn()

        events.on('chart:update-layout', updateLayout)
        events.on('legend:update-legend', updateLegend)

        meta.init({})
        meta.finish()
        meta.init({})
        vi.runOnlyPendingTimers()

        expect(updateLayout).not.toHaveBeenCalled()
        expect(updateLegend).not.toHaveBeenCalled()
    })
})
