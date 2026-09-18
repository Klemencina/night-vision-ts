import { describe, expect, it } from 'vitest'
import Events from '../../src/core/events'
import Crosshair from '../../src/core/primitives/crosshair'
import Grid from '../../src/core/primitives/grid'

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
