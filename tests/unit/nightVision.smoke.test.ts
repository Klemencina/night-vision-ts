import { beforeEach, describe, it, expect, vi } from 'vitest'

type MockWorker = {
    id: number
    chartId: string
    onevent: () => void
    exec: () => Promise<null>
    just: () => void
    send: () => void
    stop: () => void
}

const workerMock = vi.hoisted(() => {
    let seq = 0
    const instances = new Map<string, MockWorker>()
    return {
        instances,
        stops: [] as number[],
        reset() {
            seq = 0
            instances.clear()
            this.stops.length = 0
        },
        make(id: string) {
            const worker = {
                id: ++seq,
                chartId: id,
                onevent: () => {},
                exec: () => Promise.resolve(null),
                just: () => {},
                send: () => {},
                stop: vi.fn(() => {
                    this.stops.push(worker.id)
                })
            }
            return worker
        }
    }
})

const resizeMock = vi.hoisted(() => {
    return {
        cleanup: vi.fn(),
        tracker: vi.fn(() => resizeMock.cleanup),
        reset() {
            this.cleanup.mockClear()
            this.tracker.mockClear()
        }
    }
})

vi.mock('svelte', () => {
    return {
        mount: () => ({ getChart: () => ({ getLayout: () => ({}) }) }),
        unmount: vi.fn(() => Promise.resolve())
    }
})

vi.mock('../../src/NightVision.svelte', () => {
    return {
        default: {}
    }
})

vi.mock('../../src/core/se/webWork', () => {
    const instance = (id: string) => {
        if (!workerMock.instances.has(id)) {
            workerMock.instances.set(id, workerMock.make(id))
        }
        return workerMock.instances.get(id)
    }
    const release = (id: string) => {
        const worker = workerMock.instances.get(id)
        if (!worker) return
        worker.stop()
        workerMock.instances.delete(id)
    }
    return {
        instance,
        release,
        WebWork: function () {},
        default: { instance, release }
    }
})

vi.mock('../../src/stuff/resizeTracker', () => {
    return {
        default: resizeMock.tracker
    }
})

import { NightVision } from '../../src/interface'
import { unmount } from 'svelte'

describe('NightVision integration smoke', () => {
    beforeEach(() => {
        workerMock.reset()
        resizeMock.reset()
        document.body.innerHTML = ''
    })

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
        chart.destroy()
    })

    it('isolates default chart IDs and rejects conflicting IDs', () => {
        const first = new NightVision(document.createElement('div'))
        const second = new NightVision(document.createElement('div'))

        expect(first.id).not.toBe(second.id)
        expect(first.hub).not.toBe(second.hub)
        expect(first.events).not.toBe(second.events)
        expect(first.ww).not.toBe(second.ww)
        expect(() => new NightVision(document.createElement('div'), { id: first.id }))
            .toThrow('already in use')
        expect(() => { first.id = second.id }).toThrow('cannot change')

        first.destroy()
        expect((second.ww as unknown as MockWorker).stop).not.toHaveBeenCalled()
        second.destroy()
    })

    it('refreshes inferred offsets before filtering data after a history prepend', () => {
        const main = [10, 20, 30, 40, 50, 60].map(t => [t, t])
        const data = { indexBased: true, panes: [{ settings: {}, overlays: [
            { main: true, data: main }, { data: main.slice(2) }
        ] }] }
        const chart = new NightVision(document.createElement('div'), { data })
        const range = vi.spyOn(chart, 'range', 'get').mockReturnValue([4, 4])
        chart.scan.init({ id: chart.id })
        chart.scan.calcIndexOffsets()
        chart.hub.calcSubset([4, 4])
        chart.hub.detectMain()

        main.unshift([0, 0])
        chart.update('data')

        const overlay = chart.hub.panes()[0].overlays[1]
        expect(overlay.indexOffset).toBe(3)
        expect(overlay.dataSubset!.map(row => row[0])).toEqual([30, 40, 50])
        range.mockRestore()
        chart.destroy()
    })

    it('infers offsets for replacement script overlays before making their subsets', () => {
        const main = [10, 20, 30, 40, 50, 60].map(t => [t, t])
        const data = { indexBased: true, panes: [{ settings: {}, overlays: [
            { main: true, data: main }
        ] }] }
        const chart = new NightVision(document.createElement('div'), { data })
        const range = vi.spyOn(chart, 'range', 'get').mockReturnValue([3, 3])
        chart.scan.init({ id: chart.id })
        chart.hub.calcSubset([3, 3])
        chart.hub.detectMain()
        const pane = chart.hub.panes()[0]

        chart.se.replaceOverlays([{ uuid: pane.uuid, overlays: [
            { prod: true, type: 'line', data: main.slice(2) }
        ] }])

        expect(pane.overlays[1].indexOffset).toBe(2)
        expect(pane.overlays[1].dataSubset!.map(row => row[0])).toEqual([30, 40, 50])
        range.mockRestore()
        chart.destroy()
    })

    it('releases chart registries and subscriptions so the same id can be reused', () => {
        const root = document.createElement('div')
        root.id = 'nv-reuse'
        document.body.appendChild(root)

        const first = new NightVision('nv-reuse', { id: 'same-id' })
        const firstWorker = first.ww
        const firstScriptHub = first.scriptHub
        const listener = vi.fn()
        first.events.on('consumer:change', listener)

        first.destroy()

        const second = new NightVision('nv-reuse', { id: 'same-id' })

        expect(workerMock.stops).toEqual([(firstWorker as unknown as MockWorker).id])
        first.events.emit('change')
        second.events.emit('change')
        expect(listener).not.toHaveBeenCalled()
        expect(second.hub).not.toBe(first.hub)
        expect(second.meta).not.toBe(first.meta)
        expect(second.scan).not.toBe(first.scan)
        expect(second.events).not.toBe(first.events)
        expect(second.hub.se).toBe(second.se)
        expect(second.ww).not.toBe(firstWorker)
        expect(second.scriptHub).not.toBe(firstScriptHub)
        expect(second.scriptHub.ww).toBe(second.ww)
        expect((second.ww as unknown as MockWorker).id).toBe(2)
        first.destroy()
        expect((second.ww as unknown as MockWorker).stop).not.toHaveBeenCalled()
        second.destroy()
    })

    it('cleans up autoResize tracking on destroy', () => {
        const root = document.createElement('div')
        root.id = 'nv-resize'
        document.body.appendChild(root)

        const chart = new NightVision('nv-resize', { autoResize: true })

        expect(resizeMock.tracker).toHaveBeenCalledTimes(1)
        chart.destroy()
        expect(resizeMock.cleanup).toHaveBeenCalledTimes(1)
    })

    it('releases registries even when component cleanup throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const first = new NightVision(document.createElement('div'), { id: 'cleanup-error' })
        const firstWorker = first.ww as unknown as MockWorker
        vi.mocked(unmount).mockImplementationOnce(() => { throw new Error('cleanup failed') })

        first.destroy()
        const second = new NightVision(document.createElement('div'), { id: 'cleanup-error' })

        expect(firstWorker.stop).toHaveBeenCalledOnce()
        expect(second.ww).not.toBe(first.ww)
        expect(second.events).not.toBe(first.events)
        second.destroy()
        warn.mockRestore()
    })

    it('does not allocate a worker when the target container is missing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        new NightVision('missing-root', { id: 'missing-target' })

        expect(workerMock.instances.size).toBe(0)
        expect(warn).toHaveBeenCalledWith(
            '[NightVision] Container not found:',
            'missing-root',
            '- ensure element exists when creating chart'
        )
        warn.mockRestore()
    })

    it('waits for script upload before full update from scripts setter', async () => {
        const root = document.createElement('div')
        root.id = 'nv-scripts'
        document.body.appendChild(root)

        const chart = new NightVision('nv-scripts', { id: 'scripts-id' })
        const update = vi.spyOn(chart, 'update')

        chart.scripts = [
            {
                name: 'Custom',
                code: `// NavyScript~0.1-lite
[INDICATOR name=Custom]
calc(src) => src.close
[EOF]
`
            }
        ]

        expect(update).not.toHaveBeenCalledWith('full')
        await (chart as any)._scriptsReady
        await Promise.resolve()
        expect(update).toHaveBeenCalledWith('full')
        chart.destroy()
    })
})
