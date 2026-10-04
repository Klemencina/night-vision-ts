import { describe, it, expect } from 'vitest'
import DataHub, { Data, Overlay } from '../../src/core/dataHub'
import DataScanner from '../../src/core/dataScanner'

describe('DataHub multiple overlays and indicators', () => {
    it('should preserve pane and overlay order with defaults', () => {
        const hub = DataHub.instance('multi-order')
        const data = {
            panes: [
                {
                    overlays: [
                        { type: 'main', data: [[1, 2]] },
                        { type: 'line', data: [[1, 3]] }
                    ],
                    scripts: [{}, {}],
                    settings: {}
                },
                {
                    overlays: [{ type: 'hist', data: [[1, 1]] }],
                    scripts: [{}],
                    settings: {}
                }
            ]
        }

        hub.init(data)
        hub.calcSubset([0, 2])
        hub.loadScripts()

        const panes = hub.panes()
        expect(panes.length).toBe(2)
        expect(panes[0].overlays.length).toBe(2)
        expect(panes[1].overlays.length).toBe(1)
        expect(panes[0].overlays[0].type).toBe('main')
        expect(panes[0].overlays[1].type).toBe('line')
        expect(panes[1].overlays[0].type).toBe('hist')
        expect(panes[0].scripts?.length).toBe(2)
        expect(panes[1].scripts?.length).toBe(1)
    })

    it('should handle panes with missing overlays or scripts', () => {
        const hub = DataHub.instance('missing-fields')
        const data: Data = {
            panes: [
                {
                    overlays: [{ type: 'main', data: [[1, 2]] }],
                    settings: {}
                },
                {
                    overlays: [],
                    settings: {}
                }
            ]
        }

        hub.init(data)
        hub.calcSubset([0, 2])
        hub.loadScripts()

        const panes = hub.panes()
        expect(panes.length).toBe(2)
        expect(panes[0].overlays.length).toBe(1)
        expect(panes[1].overlays.length).toBe(0)
        expect(panes[0].scripts?.length).toBe(0)
        expect(panes[1].scripts?.length).toBe(0)
    })

    it('refreshes inferred offsets while preserving explicit zero and later overrides', () => {
        const id = 'offset-overrides'
        const main = [10, 20, 30, 40, 50].map(t => [t, t])
        const inferred: Overlay = { data: main.slice(1) }
        const explicit: Overlay = { data: main.slice(1), indexOffset: 0 }
        const hub = DataHub.instance(id)
        hub.init({ indexBased: true, panes: [{
            settings: {}, overlays: [{ main: true, data: main }, inferred, explicit]
        }] })
        const scan = DataScanner.instance(id)
        scan.init({ id })
        scan.calcIndexOffsets()
        expect(inferred.indexOffset).toBe(1)
        expect(explicit.indexOffset).toBe(0)

        main.unshift([0, 0])
        scan.calcIndexOffsets()
        expect(inferred.indexOffset).toBe(2)
        expect(explicit.indexOffset).toBe(0)

        inferred.indexOffset = 7
        scan.calcIndexOffsets()
        expect(inferred.indexOffset).toBe(7)
        inferred.indexOffset = undefined
        scan.calcIndexOffsets()
        expect(inferred.indexOffset).toBe(2)
        DataScanner.release(id)
        DataHub.release(id)
    })

    it('reads current main and overlay arrays before main-chart detection', () => {
        const id = 'offset-current-data'
        const main: Overlay = { main: true, data: [10, 20, 30, 40, 50].map(t => [t, t]) }
        const overlay: Overlay = { data: main.data!.slice(1) }
        const hub = DataHub.instance(id)
        hub.init({ indexBased: true, panes: [{ settings: {}, overlays: [main, overlay] }] })
        const scan = DataScanner.instance(id)
        scan.init({ id })
        scan.calcIndexOffsets()
        expect(overlay.indexOffset).toBe(1)

        main.data = [20, 30, 40, 50, 60].map(t => [t, t])
        overlay.data = main.data.slice(2)
        const added: Overlay = { data: main.data.slice(1) }
        hub.panes()[0].overlays.push(added)
        scan.calcIndexOffsets()

        expect(hub.mainOv).toBeNull()
        expect(scan.main).toBe(main.data)
        expect(scan.all).toContain(added)
        expect(overlay.indexOffset).toBe(2)
        expect(added.indexOffset).toBe(1)
        DataScanner.release(id)
        DataHub.release(id)
    })
})

describe('DataScanner default ranges', () => {
    const config = { DEFAULT_LEN: 3, MINIMUM_LEN: 1 }

    it.each([false, true])('creates a range for one candle with a supplied timeframe, indexBased=%s', indexBased => {
        const id = `single-candle-range-${indexBased}`
        const hub = DataHub.instance(id)
        hub.init({ indexBased, panes: [{ overlays: [{
            main: true, data: [[1_000_000, 10]], settings: { timeFrame: '1m' }
        }] }] })
        const scan = DataScanner.instance(id)
        scan.init({ id, config })

        expect(scan.getTimeframe()).toBe(60_000)
        expect(scan.defaultRange()).toEqual(indexBased ? [-1.5, 1.5] : [910_000, 1_090_000])
        DataScanner.release(id)
        DataHub.release(id)
    })

})

describe('streaming visible data', () => {
    it.each([false, true])('refreshes overlays sharing a changed source, indexBased=%s', indexBased => {
        const id = `streaming-shared-source-${indexBased}`
        const hub = DataHub.instance(id)
        const data = [[10, 1], [20, 2], [30, 3]]
        const main: Overlay = { main: true, data }
        const volume: Overlay = { data }
        const range: [number, number] = indexBased ? [0, 2] : [10, 30]
        hub.init({ indexBased, panes: [{ overlays: [main, volume] }] })
        hub.calcSubset(range)
        try {
            data[2] = [30, 99]
            hub.updateRange(range, new Map([[main, 2]]))
            expect(main.dataSubset).toEqual([[10, 1], [20, 2], [30, 99]])
            expect(volume.dataSubset).toEqual([[10, 1], [20, 2], [30, 99]])
            expect(volume.dataSubset!.at(-1)).toBe(data[2])

            data[1] = [20, 88]
            data.push([40, 44])
            hub.updateRange(range, new Map([[volume, 1], [main, 3]]))
            expect(main.dataSubset).toEqual([[10, 1], [20, 88], [30, 99], [40, 44]])
            expect(volume.dataSubset).toEqual(main.dataSubset)
        } finally {
            DataHub.release(id)
        }
    })

    it.each([false, true])('updates changed tails without copying visible history, indexBased=%s', indexBased => {
        const id = `streaming-subsets-${indexBased}`
        const hub = DataHub.instance(id)
        const live: Overlay = { main: true, data: [[10, 1], [20, 2], [30, 3], [40, 4]] }
        const untouched: Overlay = { data: [[10, 10], [20, 20], [30, 30], [40, 40]] }
        const range: [number, number] = indexBased ? [1, 3] : [20, 40]
        hub.init({ indexBased, panes: [{ overlays: [live, untouched] }] })
        hub.calcSubset(range)
        const visible = live.dataSubset
        const otherVisible = untouched.dataSubset
        try {
            live.data![3] = [40, 99]
            hub.updateRange(range, new Map([[live, 3]]))
            expect(live.dataSubset).toEqual([[10, 1], [20, 2], [30, 3], [40, 99]])
            expect(live.dataSubset).toBe(visible)
            expect(untouched.dataSubset).toBe(otherVisible)

            live.data!.push([50, 5])
            hub.updateRange(range, new Map([[live, 4]]))
            // Include the neighboring point outside the visible range for line drawing.
            expect(live.dataSubset).toEqual([[10, 1], [20, 2], [30, 3], [40, 99], [50, 5]])
            expect(live.dataSubset).toBe(visible)

            live.data!.splice(2, 3, [30, 77])
            hub.updateRange(range, new Map([[live, 2]]))
            expect(live.dataSubset).toEqual([[10, 1], [20, 2], [30, 77]])
            expect(live.dataSubset).toBe(visible)

            hub.updateRange(indexBased ? [2, 2] : [30, 30], new Map())
            expect(live.dataSubset).toEqual([[20, 2], [30, 77]])
            expect(untouched.dataSubset).toEqual([[20, 20], [30, 30], [40, 40]])

            // Full refreshes still observe edits made directly by the caller.
            untouched.data![1] = [20, 222]
            hub.updateRange(indexBased ? [2, 2] : [30, 30])
            expect(untouched.dataSubset).toEqual([[20, 222], [30, 30], [40, 40]])
        } finally {
            DataHub.release(id)
        }
    })

    it('rebuilds subsets when source arrays, index offsets, or chart mode change', () => {
        const id = 'streaming-subset-invalidation'
        const hub = DataHub.instance(id)
        const overlay: Overlay = { data: [[10, 1], [20, 2], [30, 3], [40, 4]], indexOffset: 0 }
        hub.init({ indexBased: true, panes: [{ overlays: [overlay] }] })
        hub.calcSubset([2, 2])
        try {
            overlay.indexOffset = 2
            hub.updateRange([2, 2], new Map())
            expect(overlay.dataSubset).toEqual([[10, 1], [20, 2]])

            overlay.data = [[10, 11], [20, 22]]
            hub.updateRange([2, 2], new Map([[overlay, 1]]))
            expect(overlay.dataSubset).toEqual([[10, 11], [20, 22]])

            hub.indexBased = false
            hub.updateRange([2, 2], new Map())
            expect(overlay.dataSubset).toEqual([[10, 11]])
        } finally {
            DataHub.release(id)
        }
    })
})
