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
        tick: async () => {},
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
        expect(chart.scriptHub.iScripts.Custom).toBeDefined()

        chart.scripts = []
        await (chart as any)._scriptsReady

        expect(chart.scriptHub.iScripts.Custom).toBeUndefined()
        expect(chart.scriptHub.iScripts.SMA).toBeDefined()
        chart.destroy()
    })
})

describe('main candle API queue', () => {
    function createChart() {
        const chart = new NightVision(document.createElement('div'), {
            data: { panes: [{ overlays: [{
                type: 'Candles', main: true,
                data: [[0, 1, 2, 0, 1], [60000, 1, 2, 0, 1]]
            }] }] }
        })
        const controller = {
            whenReady: vi.fn(async () => {}),
            fullUpdate: vi.fn(async (_options: unknown) => {}),
            getRange: () => [0, 120000]
        }
        Object.assign(chart.comp!, { getChart: () => controller })
        chart.hub.detectMain()
        return { chart, controller }
    }

    it('waits for initialization and snapshots replacement data and options at call time', async () => {
        const { chart, controller } = createChart()
        let ready!: () => void
        const gate = new Promise<void>(resolve => { ready = resolve })
        controller.whenReady.mockReturnValue(gate)
        const rows: [number, number, number, number, number][] = [
            [120000, 2, 4, 0, 3], [180000, 2, 4, 0, 3]
        ]
        const options = { resetRange: false }
        try {
            const pending = chart.setSeries(rows, options)
            rows[0][4] = -1
            options.resetRange = true
            await vi.waitFor(() => expect(controller.whenReady).toHaveBeenCalled())
            expect(chart.hub.mainOv!.data![0][0]).toBe(0)
            ready()
            await pending
            expect(chart.hub.mainOv!.data![0]).toEqual([120000, 2, 4, 0, 3])
            expect(controller.fullUpdate).toHaveBeenCalledWith({ resetRange: false })
        } finally { chart.destroy() }
    })

    it('finishes each indicator update before applying the next queued candle', async () => {
        const { chart } = createChart()
        const snapshots: number[] = []
        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })
        vi.spyOn(chart.se, 'updateData').mockImplementation(async () => {
            snapshots.push(chart.hub.mainOv!.data!.at(-1)[0])
            if (snapshots.length === 1) await gate
        })
        try {
            const first = chart.updateCandle([120000, 1, 2, 0, 1])
            const second = chart.updateCandle([180000, 1, 2, 0, 1])
            await vi.waitFor(() => expect(snapshots).toEqual([120000]))
            expect(chart.hub.mainOv!.data).toHaveLength(3)
            release()
            await Promise.all([first, second])
            expect(snapshots).toEqual([120000, 180000])
            expect(chart.hub.mainOv!.data).toHaveLength(4)
        } finally { chart.destroy() }
    })

    it('does not poison the queue after rejecting an old timestamp', async () => {
        const { chart } = createChart()
        vi.spyOn(chart.se, 'updateData').mockResolvedValue()
        try {
            const results = await Promise.allSettled([
                chart.updateCandle([0, 1, 2, 0, 1]),
                chart.updateCandle([120000, 1, 2, 0, 1])
            ])
            expect(results.map(x => x.status)).toEqual(['rejected', 'fulfilled'])
            expect(chart.hub.mainOv!.data).toHaveLength(3)
            expect(chart.hub.mainOv!.data!.at(-1)[0]).toBe(120000)
        } finally { chart.destroy() }
    })

    it('rejects queued changes when destroyed while initialization is pending', async () => {
        const { chart, controller } = createChart()
        let ready!: () => void
        controller.whenReady.mockReturnValue(new Promise<void>(resolve => { ready = resolve }))
        const pending = chart.setSeries([[120000, 1, 2, 0, 1]])
        await vi.waitFor(() => expect(controller.whenReady).toHaveBeenCalled())
        chart.destroy()
        ready()
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        expect(controller.fullUpdate).not.toHaveBeenCalled()
        expect(chart.hub.mainOv!.data).toHaveLength(2)
        await expect(chart.setSeries(null as never)).rejects.toMatchObject({ name: 'AbortError' })
        await expect(chart.updateCandle(null as never)).rejects.toMatchObject({ name: 'AbortError' })
    })
})

describe('pane and overlay API queue', () => {
    function createChart() {
        const chart = new NightVision(document.createElement('div'), {
            data: { panes: [{ overlays: [{
                type: 'Candles', main: true,
                data: [[0, 1, 2, 0, 1], [60000, 1, 2, 0, 1]]
            }] }] }
        })
        const controller = {
            whenReady: vi.fn(async () => {}),
            fullUpdate: vi.fn(async (_options: unknown) => {
                chart.hub.calcSubset([0, 120000])
                chart.hub.init(chart.data)
                chart.hub.detectMain()
            }),
            getRange: () => [0, 120000]
        }
        Object.assign(chart.comp!, { getChart: () => controller })
        chart.hub.calcSubset([0, 120000])
        chart.hub.detectMain()
        return { chart, controller }
    }

    it('snapshots input before readiness and preserves identities through renumbering', async () => {
        const { chart, controller } = createChart()
        let ready!: () => void
        controller.whenReady.mockReturnValue(new Promise<void>(resolve => { ready = resolve }))
        const input = { settings: { height: 2 }, overlays: [{ type: 'Spline', data: [[0, 1], [60000, 2]] as [number, number][] }] }
        const pending = chart.addPane(input)
        input.overlays[0].data[0][1] = 999
        input.settings.height = 999
        try {
            await vi.waitFor(() => expect(controller.whenReady).toHaveBeenCalled())
            expect(chart.data.panes).toHaveLength(1)
            ready()
            const paneId = await pending
            const pane = chart.data.panes![1]
            const overlayId = pane.overlays![0].uuid!
            expect(pane.settings!.height).toBe(2)
            expect(pane.overlays![0].data![0][1]).toBe(1)
            await chart.removePane(0)
            await chart.updatePane(paneId, { settings: { height: 3 } })
            await chart.updateOverlay(paneId, overlayId, { name: 'survives' })
            expect(chart.data.panes![0]).toBe(pane)
            expect(pane.id).toBe(0)
            expect(pane.uuid).toBe(paneId)
            expect(pane.overlays![0].uuid).toBe(overlayId)
            expect(pane.overlays![0].name).toBe('survives')
            expect(controller.fullUpdate).toHaveBeenLastCalledWith({ resetRange: false })
        } finally { ready(); chart.destroy() }
    })

    it('merges settings and props, replaces data, and selects one main overlay', async () => {
        const { chart, controller } = createChart()
        try {
            const id = await chart.addOverlay(0, {
                type: 'Spline', settings: { scale: 'B', display: true },
                props: { color: 'red', lineWidth: 2 }, data: [[0, 1], [60000, 2]]
            })
            const data = [[0, 5], [60000, 6]] as const
            await chart.updateOverlay(0, id, {
                main: true, data, settings: { display: false }, props: { color: 'blue' }
            }, { resetRange: true })
            const overlay = chart.hub.mainOv!
            expect(overlay.uuid).toBe(id)
            expect(chart.hub.allOverlays().filter(ov => ov.main)).toHaveLength(1)
            expect(overlay.settings).toMatchObject({ scale: 'B', display: false })
            expect(overlay.props).toMatchObject({ color: 'blue', lineWidth: 2 })
            expect(overlay.data).toEqual(data)
            expect(overlay.data).not.toBe(data)
            expect(controller.fullUpdate).toHaveBeenLastCalledWith({ resetRange: true })
            await chart.removeOverlay(0, id)
            expect(chart.hub.mainOv!.type).toBe('Candles')
        } finally { chart.destroy() }
    })

    it('queues structural changes with candles and recovers after a missing target', async () => {
        const { chart, controller } = createChart()
        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })
        const update = vi.spyOn(chart.se, 'updateData').mockImplementation(async () => { await gate })
        try {
            const candle = chart.updateCandle([120000, 1, 2, 0, 1])
            const results = Promise.allSettled([
                chart.removePane('missing'),
                chart.addOverlay(0, { type: 'Spline', data: [[0, 1]] })
            ])
            await vi.waitFor(() => expect(update).toHaveBeenCalled())
            expect(controller.fullUpdate).not.toHaveBeenCalled()
            release()
            await candle
            expect((await results).map(x => x.status)).toEqual(['rejected', 'fulfilled'])
            expect(chart.hub.mainOv!.data).toHaveLength(3)
            expect(chart.hub.allOverlays()).toHaveLength(2)
        } finally { release(); chart.destroy() }
    })

    it('rejects invalid and script-owned edits without mutation', async () => {
        const { chart, controller } = createChart()
        try {
            const pane = chart.data.panes![0]
            const produced = { type: 'Spline', uuid: 'produced', prod: 'indicator', data: [] }
            pane.overlays!.push(produced)
            await expect(chart.updateOverlay(0, 0, { data: [[1, 1]] })).rejects.toThrow('candle')
            await expect(chart.removeOverlay(0, 'produced')).rejects.toThrow('indicator scripts')
            await expect(chart.updateOverlay(0, 'produced', { name: 'changed' })).rejects.toThrow('indicator scripts')
            await expect(chart.addOverlay(0, { type: 'Spline', data: [[2, 1], [1, 2]] })).rejects.toThrow('increasing')
            await expect(chart.updatePane(0, { settings: {} }, { resetRange: 'yes' } as never)).rejects.toThrow('boolean')
            expect(pane.overlays![1]).toBe(produced)
            expect(controller.fullUpdate).not.toHaveBeenCalled()
            await chart.removeOverlay(0, 0)
            expect(pane.overlays).toEqual([])
            expect(chart.hub.mainOv).toBeNull()
            await chart.setSeries([[0, 1, 2, 0, 1], [60000, 1, 2, 0, 1]])
            expect(chart.hub.mainOv!.type).toBe('Candles')
        } finally { chart.destroy() }
    })

    it('streams copied auxiliary rows without recalculating the worker or replacing history', async () => {
        const { chart, controller } = createChart()
        try {
            const id = await chart.addOverlay(0, { type: 'Spline', data: [[0, 1], [60000, 2]] })
            const overlay = chart.hub.allOverlays().find(ov => ov.uuid === id)!
            const data = overlay.data!
            controller.fullUpdate.mockClear()
            const workerUpdate = vi.spyOn(chart.se, 'updateData')
            const row: [number, { value: number }] = [120000, { value: 3 }]
            const pending = chart.updateOverlayPoint(0, id, row)
            row[1].value = 999
            await pending
            await chart.updateOverlayPoint(0, id, [120000, 4])
            expect(overlay.data).toBe(data)
            expect(data).toEqual([[0, 1], [60000, 2], [120000, 4]])
            expect(workerUpdate).not.toHaveBeenCalled()
            expect(controller.fullUpdate).not.toHaveBeenCalled()
            const results = await Promise.allSettled([
                chart.updateOverlayPoint(0, id, [0, 99]),
                chart.updateOverlayPoint(0, id, [180000, 5])
            ])
            expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled'])
            expect(data).toHaveLength(4)
        } finally { chart.destroy() }
    })

    it('validates candle points and routes main-source updates to the worker', async () => {
        const { chart } = createChart()
        try {
            const update = vi.spyOn(chart.se, 'updateData').mockResolvedValue()
            await expect(chart.updateOverlayPoint(0, 0, [120000, 1])).rejects.toThrow('candle')
            await chart.updateOverlayPoint(0, 0, [120000, 1, 2, 0, 1])
            expect(update).toHaveBeenCalledTimes(1)
            expect(chart.hub.mainOv!.data).toHaveLength(3)
            chart.data.panes![0].overlays!.push({ uuid: 'generated', prod: 'indicator', data: [] } as never)
            await expect(chart.updateOverlayPoint(0, 'generated', [120000, 1])).rejects.toThrow('indicator scripts')
        } finally { chart.destroy() }
    })

    it('adds and edits indicator definitions by stable UUID and rejects unknown types', async () => {
        const { chart, controller } = createChart()
        try {
            const input = { type: 'SMA', props: { length: 5, color: 'red' } }
            const pending = chart.addIndicator(0, input)
            input.props.length = 999
            const first = await pending
            const second = await chart.addIndicator(0, { type: 'RSI', props: { length: 14 } })
            expect(chart.data.panes![0].scripts![0].props!.length).toBe(5)
            await chart.updateIndicator(0, first, { props: { length: 10 }, settings: { execOrder: 2 } })
            expect(chart.data.panes![0].scripts![0]).toMatchObject({
                uuid: first, type: 'SMA', props: { length: 10, color: 'red' }, settings: { execOrder: 2 }
            })
            await expect(chart.updateIndicator(0, first, { type: 'Missing' })).rejects.toThrow('Unknown indicator')
            await expect(chart.addIndicator(0, { type: 'toString' })).rejects.toThrow('Unknown indicator')
            expect(chart.data.panes![0].scripts).toHaveLength(2)
            await chart.removeIndicator(0, first)
            await chart.updateIndicator(0, second, { props: { length: 7 } })
            expect(chart.data.panes![0].scripts![0]).toMatchObject({ uuid: second, props: { length: 7 } })
            expect(controller.fullUpdate).toHaveBeenLastCalledWith({ resetRange: false })
        } finally { chart.destroy() }
    })

    it('removes only the selected indicator outputs across all panes', async () => {
        const { chart } = createChart()
        try {
            const first = await chart.addIndicator(0, { type: 'SMA' })
            const second = await chart.addIndicator(0, { type: 'SMA' })
            const paneId = await chart.addPane()
            const pane = chart.data.panes![1]
            const retained = { prod: second, type: 'Spline', data: [], uuid: 'keep' }
            chart.data.panes![0].overlays!.push({ prod: first, data: [] } as never, retained)
            pane.overlays!.push({ prod: first, data: [] } as never)
            await chart.removeIndicator(0, first)
            expect(chart.data.panes![0].overlays).toContain(retained)
            expect(pane.overlays).toEqual([])
            expect(pane.uuid).toBe(paneId)
            expect(chart.data.panes![0].scripts!.map(script => script.uuid)).toEqual([second])
        } finally { chart.destroy() }
    })

    it('rejects queued and subsequent pane operations after destruction', async () => {
        const { chart, controller } = createChart()
        let ready!: () => void
        controller.whenReady.mockReturnValue(new Promise<void>(resolve => { ready = resolve }))
        const pending = chart.addPane()
        await vi.waitFor(() => expect(controller.whenReady).toHaveBeenCalled())
        chart.destroy()
        ready()
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        await expect(chart.addOverlay(0, { type: 'Spline' })).rejects.toMatchObject({ name: 'AbortError' })
        await expect(chart.addIndicator(0, { type: 'SMA' })).rejects.toMatchObject({ name: 'AbortError' })
        await expect(chart.updateOverlayPoint(0, 0, [0, 1])).rejects.toMatchObject({ name: 'AbortError' })
        expect(controller.fullUpdate).not.toHaveBeenCalled()
    })
})
