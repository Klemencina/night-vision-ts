import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import Sidebar from '../../src/components/Sidebar.svelte'
import Events from '../../src/core/events'

const gestures = vi.hoisted(() => ({ handlers: new Map<string, (event: any) => void>() }))

vi.mock('hammerjs', () => ({
    Manager: class {
        add() {}
        get() { return { recognizeWith() {}, set() {} } }
        on(names: string, callback: (event: any) => void) {
            for (const name of names.split(' ')) gestures.handlers.set(name, callback)
        }
        destroy() {}
    },
    Pan: class {}, Pinch: class {}, Tap: class {}, DIRECTION_VERTICAL: 1
}))
vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => ({ yTransforms: [] }) } }))
vi.mock('../../src/stuff/dprCanvas', () => ({ default: {
    setup: (id: string) => [document.getElementById(id), {}], resize: () => false
} }))
vi.mock('../../src/core/primitives/sidebar', () => ({ default: { body() {}, panel() {} } }))

afterEach(() => {
    vi.unstubAllGlobals()
    gestures.handlers.clear()
})

describe('sidebar zoom', () => {
    it.each(['pan', 'pinch'])('preserves the logarithmic center during %s zoom', async gesture => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            queueMicrotask(() => callback(0))
            return 1
        })
        vi.stubGlobal('cancelAnimationFrame', () => {})
        const chartId = `sidebar-log-${gesture}`
        const events = Events.instance(chartId)
        const transformed = vi.fn()
        events.on('test:sidebar-transform', transformed)
        const target = document.createElement('div')
        document.body.appendChild(target)
        // Symmetrical log maps 3 and 15 to log(4) and log(16).
        // Their midpoint is log(8), so halving the span yields 8*sqrt(2)-1 and 8/sqrt(2)-1.
        const scale = {
            $hi: 15, $lo: 3,
            A: -100 / Math.log(4), B: 200,
            scaleSpecs: { id: 'A', log: true }, ys: [], prec: 2
        }
        const sidebar = mount(Sidebar, { target, props: {
            id: 0, side: 'right', scales: ['A'],
            props: { id: chartId, config: {}, colors: {}, cursor: {} },
            layout: {
                width: 400, height: 100, sbMax: [0, 50], scales: { A: scale },
                settings: { scaleTemplate: [[], ['A']], scaleSideIdxs: [undefined, 'A'] }
            }
        } })

        try {
            flushSync()
            await vi.waitFor(() => expect(gestures.handlers.has(`${gesture}start`)).toBe(true))
            gestures.handlers.get(`${gesture}start`)?.({ center: { y: 100 } })
            if (gesture === 'pan') {
                gestures.handlers.get('panmove')?.({ center: { y: 100 - 100 / 3 } })
            } else {
                gestures.handlers.get('pinch')?.({ scale: 2 })
            }
            const transform = transformed.mock.calls.at(-1)?.[0]
            expect(transform?.auto).toBe(false)
            expect(transform?.range[0]).toBeCloseTo(8 * Math.sqrt(2) - 1)
            expect(transform?.range[1]).toBeCloseTo(8 / Math.sqrt(2) - 1)
        } finally {
            await unmount(sidebar)
            Events.release(chartId)
            target.remove()
        }
    })
})
