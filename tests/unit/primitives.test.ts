import { describe, expect, it } from 'vitest'
import Events from '../../src/core/events'
import Crosshair from '../../src/core/primitives/crosshair'
import Grid from '../../src/core/primitives/grid'
import layoutCnv from '../../src/core/primitives/navyLib/layoutCnvFast'

describe('pane layer subscriptions', () => {
    for (const [Primitive, event] of [[Crosshair, 'show-crosshair'], [Grid, 'show-grid']] as const) {
        it(`keeps ${event} listeners independent across panes and replacements`, () => {
            const id = `primitive-${event}`
            const events = Events.instance(id)
            const first = new Primitive('0', id)
            const second = new Primitive('0', id)
            const otherChart = new Primitive('0', id + '-other')

            events.emit(event, false)
            expect(first.show).toBe(false)
            expect(second.show).toBe(false)
            expect(otherChart.show).toBe(true)

            first.destroy()
            const replacement = new Primitive('0', id)
            first.destroy()
            events.emit(event, true)
            expect(first.show).toBe(false)
            expect(second.show).toBe(true)
            events.emit(event, false)
            expect(replacement.show).toBe(false)
            expect(second.show).toBe(false)

            second.destroy()
            replacement.destroy()
            otherChart.destroy()
            Events.release(id)
            Events.release(id + '-other')
        })
    }
})

describe('candle volume layout', () => {
    function makeLayout(volumes: number[]) {
        const data = volumes.map((volume, i) => [i * 60000, 100, 102, 98, i ? 99 : 101, volume])
        return layoutCnv({
            props: { config: { CANDLEW: 0.6, VOLSCALE: 0.2 }, interval: 60000 },
            data,
            dataSubset: data,
            layout: {
                ti2x: t => t / 600,
                height: 300,
                scaleSpecs: { log: false },
                A: -10,
                B: 1200,
                pxStep: 100
            },
            view: { i1: 0, i2: data.length - 1 }
        })
    }

    it('draws zero-height bars when every visible volume is zero', () => {
        const layout = makeLayout([0, 0])
        expect(layout.volScale).toBe(0)
        expect(layout.upVolbars[0].h).toBe(0)
        expect(layout.dwVolbars[0].h).toBe(0)
        expect(layout.upBodies[0]).toMatchObject({ o: 200, h: 180, l: 220, c: 190 })
        expect(layout.dwBodies[0]).toMatchObject({ o: 200, h: 180, l: 220, c: 210 })
    })
})
