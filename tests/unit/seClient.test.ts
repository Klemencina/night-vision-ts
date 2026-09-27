import { describe, expect, it, vi } from 'vitest'
import SeClients, { SeClient } from '../../src/core/se/seClient'
import DataHub, { Overlay } from '../../src/core/dataHub'
import Events from '../../src/core/events'

describe('indicator update responses', () => {
    it('refreshes visible subsets when indicator rows change without an append', async () => {
        const id = 'revision-subset'
        const hub = DataHub.instance(id)
        const range: [number, number] = [300000, 420000]
        const indicator: Overlay = { uuid: 'indicator', data: [[300000, 1], [360000, 2], [420000, 3]] }
        hub.init({ panes: [{ overlays: [
            { main: true, data: [[300000, 1], [360000, 2], [420000, 3]] }, indicator
        ] }] })
        hub.calcSubset(range)
        hub.detectMain()
        const chart = {
            ww: { onevent: vi.fn(), exec: vi.fn().mockResolvedValue({
                indicator: { start: 2, data: [[420000, 99]] }
            }) },
            update: vi.fn((type?: string) => {
                if (type === 'data') hub.updateRange(range)
            })
        }
        const client = new SeClient(id, chart)
        client.setRefs(hub, {})

        try {
            expect(indicator.dataSubset).toEqual([[300000, 1], [360000, 2], [420000, 3]])
            await client.updateData()

            expect(indicator.dataSubset).toEqual([[300000, 1], [360000, 2], [420000, 99]])
            expect(indicator.dataSubset!.at(-1)).toBe(indicator.data!.at(-1))
        } finally {
            DataHub.release(id)
            SeClients.release(id)
            Events.release(id)
        }
    })
})

describe('source removal', () => {
    it('clears worker OHLCV before executing the remaining scripts without a main overlay', async () => {
        const exec = vi.fn().mockResolvedValue(undefined)
        const client = new SeClient('empty-source', {
            ww: { onevent: vi.fn(), exec }, range: [0, 120000], update: vi.fn()
        })
        client.setRefs({ mainOv: null, panes: () => [{ uuid: 'pane', id: 0, scripts: [] }] }, { tf: 0 })
        await client.uploadAndExec()
        expect(exec.mock.calls).toEqual([
            ['upload-data', { meta: { range: [0, 120000], tf: 0 }, dss: { ohlcv: [] } }],
            ['exec-all-scripts', [{ uuid: 'pane', id: 0, scripts: [] }]]
        ])
    })
})

describe('script overlay reconciliation', () => {
    function setup(panes: any[]) {
        const update = vi.fn()
        const calcSubset = vi.fn()
        const emit = vi.fn()
        const client = new SeClient('overlay-reconciliation', { ww: null, range: [0, 1], update })
        client.setRefs({ panes: () => panes, calcSubset, events: { emit } }, { calcIndexOffsets: vi.fn() })
        return { client, update, calcSubset, emit }
    }

    it('keeps incremental updates for the same producer and replaces a same-type new producer', () => {
        const authored = { uuid: 'authored', type: 'Line', data: [[0, 1]] }
        const original = { uuid: 'a-output', prod: 'a', type: 'Line', data: [[0, 2]] }
        const pane = { uuid: 'main', overlays: [authored, original] }
        const { client, update, calcSubset } = setup([pane])

        client.onOverlayData([{ uuid: 'main', overlays: [
            { uuid: 'a-next', prod: 'a', type: 'Line', data: [[0, 3]] }
        ] }])
        expect(pane.overlays[1]).toBe(original)
        expect(original.data).toEqual([[0, 3]])
        expect(update).toHaveBeenLastCalledWith('data', { updateHash: true })
        expect(calcSubset).not.toHaveBeenCalled()

        client.onOverlayData([{ uuid: 'main', overlays: [
            { uuid: 'b-output', prod: 'b', type: 'Line', data: [[0, 4]] }
        ] }])
        expect(pane.overlays).toEqual([authored, {
            uuid: 'b-output', prod: 'b', type: 'Line', data: [[0, 4]]
        }])
        expect(pane.overlays[1]).not.toBe(original)
        expect(calcSubset).toHaveBeenCalledOnce()
        expect(update).toHaveBeenLastCalledWith()
    })

    it('removes one producer from every pane while retaining other outputs and authored overlays', () => {
        const authoredMain = { uuid: 'main-authored', type: 'Line', data: [] }
        const authoredSecond = { uuid: 'second-authored', type: 'Line', data: [] }
        const panes = [
            { uuid: 'main', overlays: [
                authoredMain,
                { uuid: 'a-main', prod: 'a', type: 'Line', data: [] },
                { uuid: 'b-main', prod: 'b', type: 'Line', data: [] }
            ] },
            { uuid: 'second', overlays: [
                authoredSecond,
                { uuid: 'a-second', prod: 'a', type: 'Histogram', data: [] },
                { uuid: 'b-second', prod: 'b', type: 'Line', data: [] }
            ] }
        ]
        const { client, calcSubset, emit } = setup(panes)

        client.onOverlayData([
            { uuid: 'main', overlays: [{ uuid: 'b-main', prod: 'b', type: 'Line', data: [[0, 5]] }] },
            { uuid: 'second', overlays: [{ uuid: 'b-second', prod: 'b', type: 'Line', data: [[0, 6]] }] }
        ])

        expect(panes[0].overlays.map(ov => ov.uuid)).toEqual(['main-authored', 'b-main'])
        expect(panes[1].overlays.map(ov => ov.uuid)).toEqual(['second-authored', 'b-second'])
        expect(panes[0].overlays[0]).toBe(authoredMain)
        expect(panes[1].overlays[0]).toBe(authoredSecond)
        expect(calcSubset).toHaveBeenCalledOnce()
        expect(emit).toHaveBeenCalledWith('remake-grid')
    })

    it('replaces reordered outputs from two producers of the same type', () => {
        const first = { uuid: 'a-output', prod: 'a', type: 'Line', data: [[0, 1]] }
        const second = { uuid: 'b-output', prod: 'b', type: 'Line', data: [[0, 2]] }
        const pane = { uuid: 'main', overlays: [first, second] }
        const { client, calcSubset } = setup([pane])

        client.onOverlayData([{ uuid: 'main', overlays: [
            { uuid: 'b-output', prod: 'b', type: 'Line', data: [[0, 3]] },
            { uuid: 'a-output', prod: 'a', type: 'Line', data: [[0, 4]] }
        ] }])

        expect(pane.overlays.map(ov => ov.prod)).toEqual(['b', 'a'])
        expect(pane.overlays.map(ov => ov.data)).toEqual([[[0, 3]], [[0, 4]]])
        expect(calcSubset).toHaveBeenCalledOnce()
    })
})
