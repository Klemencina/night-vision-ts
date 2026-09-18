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
