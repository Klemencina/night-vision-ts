import { describe, expect, it, vi } from 'vitest'
import Input from '../../src/core/input/pointer'

function makeInput() {
    const input = new Input()
    const data = Array.from({ length: 20 }, (_, i) => [i * 60000, i])
    input.hub = { mainOv: { data, dataSubset: data } }
    input.range = [0, 1200000]
    input.interval = 60000
    input.MIN_ZOOM = 2
    input.MAX_ZOOM = 100
    input.meta = {}
    input.events = { emit: vi.fn() }
    input.wmode = 'pass'
    input.canvas = document.createElement('canvas')
    input.props = { config: { ZOOM_MODE: 'right' } } as typeof input.props
    input.layout = {
        width: 200, height: 100, $hi: 100, $lo: 0, A: -1, B: 100,
        scaleIndex: 'right', scaleSpecs: { log: false }, settings: {}, ti: t => t
    }
    return input
}

describe('wheel range updates', () => {
    it.each([0, 50])('emits the final range once for horizontal wheel delta=%s', delta => {
        const input = makeInput()
        const snapshots: number[][] = []
        input.events.emit.mockImplementation((_type: string, range: number[]) => {
            snapshots.push([...range])
        })

        input.mousezoom(delta, { deltaX: 1, deltaY: 1, originalEvent: {} })

        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]).toEqual(input.range)
        expect(input.range[1]).toBe(1213200)
        expect(input.range[0]).toBe(delta ? 13008 : 13200)
    })

    it.each([-50, 50])('still emits horizontal panning when zoom delta=%s is blocked', delta => {
        const input = makeInput()
        input.MIN_ZOOM = 20
        input.MAX_ZOOM = 19

        input.mousezoom(delta, { deltaX: 1, deltaY: 1, originalEvent: {} })

        expect(input.events.emit).toHaveBeenCalledTimes(1)
        expect(input.range).toEqual([13200, 1213200])
    })

    it('keeps standalone trackpad scrolling observable', () => {
        const input = makeInput()
        input.trackpadScroll({ deltaX: 1 })
        expect(input.events.emit).toHaveBeenCalledTimes(1)
        expect(input.range).toEqual([13200, 1213200])
    })
})
