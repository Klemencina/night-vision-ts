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
