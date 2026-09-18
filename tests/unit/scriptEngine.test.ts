import { beforeEach, describe, expect, it, vi } from 'vitest'
import se from '../../src/core/se/script_engine'
import Sampler from '../../src/core/se/sampler'
import TS from '../../src/core/se/script_ts'

const candle = (i: number, volume = 1) => [300000 + i * 60000, i + 1, i + 1, i + 1, i + 1, volume]

beforeEach(() => {
    Object.assign(se, {
        data: { ohlcv: { id: 'ohlcv', data: Array.from({ length: 20 }, (_, i) => candle(i)) } },
        map: {}, queue: [], delta_queue: [], update_queue: [], mods: {}, sett: {},
        tf: 60000, running: false, _restart: false, send: vi.fn()
    })
    Object.assign(self, {
        scriptLib: {
            prefabs: { Spline: {} },
            iScripts: {
                Close: { code: { update: 'Spline(close[0])' } },
                Study: { code: { update: 'Spline([ema(close, 3)[0], close[10], close5m[0]])' } }
            }
        },
        paneStruct: [{ uuid: 'pane', scripts: [
            { uuid: 'a', type: 'Close', props: {} },
            { uuid: 'b', type: 'Study', props: {} }
        ], overlays: [] }]
    })
})

describe('indicator streaming', () => {
    it('replaces live volume revisions and preserves manual aggregation', async () => {
        se.data.ohlcv.data = [[0, 1, 1, 1, 1, 2]]
        ;(self as any).scriptLib.iScripts.Volume = { code: { update: 'Spline(vol5m[0])' } }
        ;(self as any).paneStruct[0].scripts = [{ uuid: 'a', type: 'Volume', props: {} }]
        await se.exec_all()
        const revise = (rows: number[][]) => se.update(rows, { data: { id: 'volume' } })
        revise([[0, 1, 1, 1, 1, 3]])
        revise([[0, 1, 1, 1, 1, 3]])
        expect(se.tss.vol5m[0]).toBe(3)
        revise([[60000, 1, 1, 1, 1, 4]])
        expect(se.tss.vol5m[0]).toBe(7)
        revise([[60000, 1, 1, 1, 1, 5], [120000, 1, 1, 1, 1, 6]])
        expect(se.tss.vol5m[0]).toBe(14)
        await se.exec_sel({ a: { length: 3 } })
        expect(se.tss.vol5m[0]).toBe(14)
        revise([[300000, 1, 1, 1, 1, 7]])
        expect(se.tss.vol5m.slice(0, 2)).toEqual([7, 14])

        const manual = TS('volume', [])
        manual.__tf__ = 300000
        const sample = Sampler('vol').bind(manual)
        sample(2, 0)
        sample(3, 0)
        expect(manual[0]).toBe(5)
    })

    it('keeps unedited indicators current after selective recalculation', async () => {
        await se.exec_all()
        await se.exec_sel({ a: { length: 3 } })
        se.update([candle(20)], { data: { id: 'tick' } })

        const overlays = (self as any).paneStruct[0].overlays
        expect(overlays.find((ov: any) => ov.prod === 'a').data.at(-1))
            .toEqual([1500000, 21])
        expect(overlays.find((ov: any) => ov.prod === 'b').data.at(-1))
            .toEqual([1500000, 20, 11, 21])
    })
})
