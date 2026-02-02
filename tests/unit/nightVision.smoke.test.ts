import { describe, it, expect, vi } from 'vitest'

vi.mock('svelte', () => {
    return {
        mount: () => ({ getChart: () => ({ getLayout: () => ({}) }) }),
        unmount: () => {}
    }
})

vi.mock('../../src/NightVision.svelte', () => {
    return {
        default: {}
    }
})

vi.mock('../../src/core/se/webWork', () => {
    const instance = () => ({
        onevent: () => {},
        exec: () => Promise.resolve(null),
        just: () => {},
        send: () => {},
        stop: () => {}
    })
    return {
        instance,
        WebWork: function () {},
        default: { instance }
    }
})

import { NightVision } from '../../src/interface'

describe('NightVision integration smoke', () => {
    it('should initialize with multiple overlays and indicator scripts', () => {
        const root = document.createElement('div')
        root.id = 'nv-smoke'
        document.body.appendChild(root)

        const data = {
            panes: [
                {
                    overlays: [
                        { type: 'main', data: [[1, 10, 12, 9, 11]] },
                        { type: 'line', data: [[1, 11]] }
                    ],
                    scripts: [{}, {}],
                    settings: {}
                },
                {
                    overlays: [{ type: 'hist', data: [[1, 4]] }],
                    scripts: [{}],
                    settings: {}
                }
            ]
        }

        const chart = new NightVision('nv-smoke', { data })
        chart.hub.calcSubset([0, 2])

        const panes = chart.hub.panes()
        expect(panes.length).toBe(2)
        expect(panes[0].overlays.length).toBe(2)
        expect(panes[1].overlays.length).toBe(1)
        expect(panes[0].scripts?.length).toBe(2)
        expect(panes[1].scripts?.length).toBe(1)
        expect(chart.hub.allOverlays().length).toBe(3)
    })
})
