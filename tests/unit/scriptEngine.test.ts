import { beforeEach, describe, expect, it, vi } from 'vitest'
import se from '../../src/core/se/script_engine'

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
