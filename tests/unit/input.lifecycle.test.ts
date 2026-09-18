import { afterEach, describe, expect, it, vi } from 'vitest'
import FrameAnimation from '../../src/stuff/frame'
import Input from '../../src/core/input/pointer'

const handlers = vi.hoisted(() => ({ hamster: vi.fn(), hammer: vi.fn() }))

vi.mock('hamsterjs', () => ({ default: handlers.hamster }))
vi.mock('hammerjs', () => ({ Manager: handlers.hammer }))
vi.mock('../../src/core/dataHub', () => ({ default: { instance: () => ({}) } }))
vi.mock('../../src/core/metaHub', () => ({ default: { instance: () => ({}) } }))
vi.mock('../../src/core/events', () => ({ default: { instance: () => ({}) } }))

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
})

describe('input lifecycle', () => {
    it('stops momentum after a delayed frame', () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const callback = vi.fn()
        new FrameAnimation(callback)

        vi.advanceTimersByTime(16)
        expect(callback).toHaveBeenCalledTimes(1)
        vi.setSystemTime(200)
        vi.advanceTimersByTime(16)

        expect(vi.getTimerCount()).toBe(0)
        expect(callback).toHaveBeenCalledTimes(1)
    })

    it('does not attach input listeners after destruction during setup', async () => {
        const canvas = document.createElement('canvas')
        const addListener = vi.spyOn(canvas, 'addEventListener')
        const input = new Input()
        const setup = input.setup({
            canvas,
            props: { id: 'disposed-input', range: [0, 10], interval: 1, config: {} },
            layout: {}
        } as Parameters<Input['setup']>[0])

        input.destroy()
        await setup

        expect(handlers.hamster).not.toHaveBeenCalled()
        expect(handlers.hammer).not.toHaveBeenCalled()
        expect(addListener).not.toHaveBeenCalled()
    })

    it('stops momentum when destroyed without an attached canvas', () => {
        vi.useFakeTimers()
        const input = new Input()
        const callback = vi.fn()
        input.fade = new FrameAnimation(callback)

        input.destroy()
        input.destroy()
        vi.advanceTimersByTime(32)

        expect(vi.getTimerCount()).toBe(0)
        expect(callback).not.toHaveBeenCalled()
    })
})
