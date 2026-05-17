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

import { NightVision } from '../../src/interface'

describe('NightVision integration smoke', () => {
    beforeEach(() => {
        workerMock.reset()
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
    })

    it('releases worker singletons on destroy so the same id can be reused', () => {
        const root = document.createElement('div')
        root.id = 'nv-reuse'
        document.body.appendChild(root)

        const first = new NightVision('nv-reuse', { id: 'same-id' })
        const firstWorker = first.ww

        first.destroy()

        const second = new NightVision('nv-reuse', { id: 'same-id' })

        expect(workerMock.stops).toEqual([(firstWorker as unknown as MockWorker).id])
        expect(second.ww).not.toBe(firstWorker)
        expect((second.ww as unknown as MockWorker).id).toBe(2)
    })
})
