import { afterEach, describe, expect, it, vi } from 'vitest'
import DataHub from '../../src/core/dataHub'
import Events from '../../src/core/events'
import MetaHub from '../../src/core/metaHub'

function setup(id: string) {
    const hub = DataHub.instance(id)
    hub.init({
        panes: [
            {
                overlays: [{ type: 'main', data: [[1, 2, 3, 1, 2]], main: true }],
                settings: {}
            }
        ]
    })
    hub.calcSubset([0, 2])
    hub.detectMain()

    const events = Events.instance(id)
    const meta = MetaHub.instance(id)
    return { events, meta }
}

describe('MetaHub lifecycle refresh', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('emits one deferred refresh after current metadata extraction finishes', () => {
        vi.useFakeTimers()
        const { events, meta } = setup('meta-current-refresh')
        const updateLayout = vi.fn()
        const updateLegend = vi.fn()

        events.on('chart:update-layout', updateLayout)
        events.on('legend:update-legend', updateLegend)

        meta.init({})
        meta.finish()
        vi.runOnlyPendingTimers()

        expect(updateLayout).toHaveBeenCalledTimes(1)
        expect(updateLegend).toHaveBeenCalledTimes(1)
    })

    it('does not emit a stale deferred refresh after metadata is reinitialized', () => {
        vi.useFakeTimers()
        const { events, meta } = setup('meta-stale-refresh')
        const updateLayout = vi.fn()
        const updateLegend = vi.fn()

        events.on('chart:update-layout', updateLayout)
        events.on('legend:update-legend', updateLegend)

        meta.init({})
        meta.finish()
        meta.init({})
        vi.runOnlyPendingTimers()

        expect(updateLayout).not.toHaveBeenCalled()
        expect(updateLegend).not.toHaveBeenCalled()
    })
})
