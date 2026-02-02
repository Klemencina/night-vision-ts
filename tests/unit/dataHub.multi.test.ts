import { describe, it, expect } from 'vitest'
import DataHub, { Data } from '../../src/core/dataHub'

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
})
