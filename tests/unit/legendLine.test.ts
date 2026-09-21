import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import LegendLineHost from './fixtures/LegendLineHost.svelte'
import Events from '../../src/core/events'

const fixture = vi.hoisted(() => ({
    legend: vi.fn((row: number[]) => row[1] === 10 ? null : [[row[1], '#ffffff']])
}))

vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => ({
    getLegendFns: () => ({ legend: fixture.legend })
}) } }))
vi.mock('../../src/core/dataHub', () => ({ default: { instance: () => ({ panes: () => [] }) } }))
vi.mock('../../src/components/LegendControls.svelte', () => ({ default: () => {} }))
vi.mock('../../src/components/IndicatorSettings.svelte', () => ({ default: () => {} }))

describe('conditional legend values', () => {
    it('restores the legend after a null result and formats each value once', async () => {
        fixture.legend.mockClear()
        const target = document.createElement('div')
        document.body.appendChild(target)
        const host = mount(LegendLineHost, { target, props: {
            props: {
                id: 'conditional-legend', colors: {}, config: { FONT: '12px sans-serif' },
                cursor: { values: [[[300000, 20]]] }
            },
            ov: { id: 0, main: true, name: 'Conditional legend', settings: {}, dataSubset: [[300000, 20]] },
            layout: { width: 500, scaleIndex: 'A', scales: { A: { prec: 2, scaleSpecs: { ovIdxs: [0] } } } }
        } })

        try {
            flushSync()
            expect(target.querySelector('.nvjs-ll-value')?.textContent?.trim()).toBe('20.00')
            expect(fixture.legend).toHaveBeenCalledTimes(1)

            host.setValues([[[300000, 10]]])
            flushSync()
            expect(target.querySelector('.nvjs-legend-line')).toBeNull()
            expect(fixture.legend).toHaveBeenCalledTimes(2)

            host.setValues([[[360000, 30]]])
            flushSync()
            expect(target.querySelector('.nvjs-ll-value')?.textContent?.trim()).toBe('30.00')
            expect(fixture.legend).toHaveBeenCalledTimes(3)
        } finally {
            await unmount(host)
            Events.release('conditional-legend')
            target.remove()
        }
    })
})
