import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import Chart from '../../src/components/Chart.svelte'
import Events from '../../src/core/events'

const fixture = vi.hoisted(() => {
    const overlay = {
        id: 0,
        main: true,
        data: [[300000, 10], [360000, 20]],
        dataSubset: [[300000, 10], [360000, 20]]
    }
    const pane = { id: 0, overlays: [overlay], settings: {} }
    return {
        hub: {
            mainOv: overlay,
            chart: pane,
            panes: () => [pane],
            calcSubset: () => {},
            detectMain: () => {},
            loadScripts: async () => {}
        },
        meta: { init: () => {} },
        scan: {
            init: () => {},
            detectInterval: () => 60000,
            getTimeframe: () => 60000,
            defaultRange: () => [240000, 420000],
            calcIndexOffsets: () => {},
            updatePanesHash: () => {},
            panesChanged: () => false
        }
    }
})

vi.mock('../../src/core/dataHub', () => ({ default: { instance: () => fixture.hub } }))
vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => fixture.meta } }))
vi.mock('../../src/core/dataScanner', () => ({ default: { instance: () => fixture.scan } }))
vi.mock('../../src/stuff/context', () => ({ default: class {} }))
vi.mock('../../src/core/layout', () => ({
    default: class {
        main = { startx: 0, pxStep: 1, x2ti: (x: number) => x }
        grids = [{}]
        indexBased = false
    }
}))
vi.mock('../../src/components/Pane.svelte', async () => import('./fixtures/CursorPane.svelte'))
vi.mock('../../src/components/Botbar.svelte', () => ({ default: () => {} }))
vi.mock('../../src/components/NoDataStub.svelte', () => ({ default: () => {} }))

describe('cursor updates in Svelte descendants', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        Events.release('cursor-reactivity')
        document.body.innerHTML = ''
    })

    it('refreshes cursor-only values while preserving the cursor instance', async () => {
        const target = document.createElement('div')
        document.body.appendChild(target)
        const chart = mount(Chart, {
            target,
            props: { props: { id: 'cursor-reactivity', config: {} } }
        })

        try {
            flushSync()
            await Promise.resolve()
            await vi.advanceTimersByTimeAsync(20)
            flushSync()
            const cursor = chart.getCursor()

            chart.setCursor({ mode: 'explore', values: [[[300000, 10]]] })
            await vi.advanceTimersByTimeAsync(20)
            flushSync()
            expect(target.querySelector('[data-cursor-value]')?.textContent).toBe('10')
            expect(chart.getCursor()).toBe(cursor)

            chart.setCursor({ mode: 'explore', values: [[[360000, 20]]] })
            await vi.advanceTimersByTimeAsync(20)
            flushSync()
            expect(target.querySelector('[data-cursor-value]')?.textContent).toBe('20')
            expect(chart.getCursor()).toBe(cursor)
        } finally {
            await unmount(chart)
        }
    })
})
