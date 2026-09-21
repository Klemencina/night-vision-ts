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
    it('returns the revised final row and every appended output without copying earlier history', async () => {
        se.data.ohlcv.data = Array.from({ length: 2000 }, (_, i) => candle(i))
        ;(self as any).paneStruct[0].scripts = [{ uuid: 'a', type: 'Close', props: {} }]
        await se.exec_all()
        vi.mocked(se.send).mockClear()
        const revision = candle(1999)
        revision[4] = 3000
        se.update([revision, candle(2000), candle(2001)], { data: { id: 'batch' } })

        const overlay = (self as any).paneStruct[0].overlays[0]
        expect(se.send).toHaveBeenCalledWith('overlay-update', {
            [overlay.uuid]: { start: 1999, data: [
                [revision[0], 3000], [candle(2000)[0], 2001], [candle(2001)[0], 2002]
            ] }
        }, 'batch')
    })

    it('includes closing revisions in sparse outputs with time offsets', async () => {
        ;(self as any).scriptLib.iScripts.Sparse = { code: { update: `
            if (iter % 2 === 0) Spline(offset(onclose() ? close[0] + 100 : close[0], -3))
        ` } }
        ;(self as any).paneStruct[0].scripts = [{ uuid: 'a', type: 'Sparse', props: {} }]
        se.data.ohlcv.data = Array.from({ length: 3 }, (_, i) => candle(i))
        await se.exec_all()
        vi.mocked(se.send).mockClear()
        se.update([candle(3), candle(4)], { data: { id: 'sparse' } })

        const overlay = (self as any).paneStruct[0].overlays[0]
        expect(se.send).toHaveBeenCalledWith('overlay-update', {
            [overlay.uuid]: { start: 1, data: [[240000, 103], [360000, 5]] }
        }, 'sparse')
    })

    it('initializes custom sampler totals and history on the first candle', async () => {
        ;(self as any).scriptLib.iScripts.Sampled = { code: { update: `
            Spline([sample(vol[0], 'vol', '5m')[0], tstf(close[0], '5m')[1]])
        ` } }
        ;(self as any).paneStruct[0].scripts = [{ uuid: 'a', type: 'Sampled', props: {} }]
        se.data.ohlcv.data = Array.from({ length: 6 }, (_, i) => candle(i))
        await se.exec_all()

        expect((self as any).paneStruct[0].overlays[0].data).toEqual([
            [300000, 1, undefined], [360000, 2, undefined], [420000, 3, undefined],
            [480000, 4, undefined], [540000, 5, undefined], [600000, 1, 5]
        ])
    })

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

    it('bounds derived history while preserving lookbacks through recalculation and streaming', async () => {
        se.data.ohlcv.data = Array.from({ length: 200 }, (_, i) => candle(i))
        ;(self as any).scriptLib.iScripts.Derived = { code: {
            init: 'buffsize(ohlc4, 65)',
            update: `
                let lookback = iter < 100 ? 2 : 60
                Spline([hl2[0], sma(hlc3, $props.length)[0], ohlc4[lookback], close5m[6]])
            `
        } }
        ;(self as any).paneStruct[0].scripts = [{ uuid: 'a', type: 'Derived', props: { length: 12 } }]
        const output = () => (self as any).paneStruct[0].overlays[0].data
        const lengths = () => Object.fromEntries(Object.entries(se.tss).map(([id, ts]) => [id, ts.length]))

        await se.exec_all()
        expect(output().at(-1)).toEqual([12240000, 200, 194.5, 140, 170])
        expect(output()[100][3]).toBe(41)
        expect(lengths()).toEqual({ hl2: 5, hlc3: 15, ohlc4: 65, close5m: 11 })
        const derived = se.tss.hlc3
        const sampled = se.tss.close5m

        await se.exec_sel({ a: { length: 40 } })
        expect(output().at(-1)).toEqual([12240000, 200, 180.5, 140, 170])
        expect(lengths()).toEqual({ hl2: 5, hlc3: 40, ohlc4: 65, close5m: 11 })
        expect(se.tss.hlc3).toBe(derived)
        expect(se.tss.close5m).toBe(sampled)

        se.update([candle(200)], { data: { id: 'derived-tick' } })
        expect(output().at(-1)).toEqual([12300000, 201, 181.5, 141, 175])
        expect(lengths()).toEqual({ hl2: 5, hlc3: 40, ohlc4: 65, close5m: 11 })
    })
})
