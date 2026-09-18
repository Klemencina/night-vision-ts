import { expect, it, vi } from 'vitest'
import se from '../../src/core/se/script_engine'
import Utils from '../../src/stuff/utils'
import '../../src/core/se/worker'

it('serializes worker commands and retains changes received during execution', async () => {
    let release!: () => void
    const pause = vi.spyOn(Utils, 'pause').mockImplementationOnce(() => new Promise(resolve => {
        release = () => resolve()
    }))
    const replies: any[] = []
    const post = vi.spyOn(self, 'postMessage').mockImplementation((message: any) => {
        replies.push(message)
    })
    Object.assign(se, {
        data: { ohlcv: { id: 'ohlcv', data: [[300000, 1, 1, 1, 1, 1]] } },
        tf: 60000, running: false, _restart: false
    })
    const send = (type: string, id: string, data: any) => self.onmessage!({
        data: { type, id, data }
    } as MessageEvent)
    send('upload-scripts', 'scripts', {
        prefabs: { Spline: {} }, iScripts: { Close: { code: { update: 'Spline(close[0])' } } }
    })
    const pane = (ids: string[]) => [{ uuid: 'pane', overlays: [], scripts: ids.map(uuid => ({
        uuid, type: 'Close', props: {}
    })) }]
    send('exec-all-scripts', 'first', pane(['a']))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    send('exec-all-scripts', 'add', pane(['a', 'b', 'c']))
    send('exec-all-scripts', 'remove', pane(['a', 'b']))
    send('exec-sel', 'props-a', { a: { length: 3, color: 'red' } })
    send('exec-sel', 'props-b', { b: { length: 8 }, a: { length: 5 } })
    release()

    await vi.waitFor(() => expect(replies.some(x => x.id === 'props-b')).toBe(true))
    expect(Object.keys(se.map)).toEqual(['a', 'b'])
    expect(se.map.a.props).toEqual({ length: 5, color: 'red' })
    expect(se.map.b.props).toEqual({ length: 8 })
    expect(replies.filter(x => x.type.endsWith('-done')).map(x => x.id))
        .toEqual(['scripts', 'first', 'add', 'remove', 'props-a', 'props-b'])
    post.mockRestore()
    pause.mockRestore()
})

it('replies to every failed command and continues after indicator errors', async () => {
    let release!: () => void
    const pause = vi.spyOn(Utils, 'pause').mockImplementationOnce(() => new Promise(resolve => {
        release = () => resolve()
    }))
    const replies: any[] = []
    const post = vi.spyOn(self, 'postMessage').mockImplementation((message: any) => {
        replies.push(message)
    })
    Object.assign(se, {
        data: { ohlcv: { id: 'ohlcv', data: [[300000, 1, 1, 1, 1, 1]] } },
        tf: 60000, running: false, _restart: false, mods: {}
    })
    const send = (type: string, id: string, data: any) => self.onmessage!({
        data: { type, id, data }
    } as MessageEvent)
    const pane = (type: string) => [{ uuid: 'pane', overlays: [], scripts: [{
        uuid: 'a', type, props: {}
    }] }]
    try {
        send('upload-scripts', 'scripts', {
            prefabs: { Spline: {} }, iScripts: {
                Close: { code: { update: 'Spline(close[0])' } },
                Broken: { code: { update: 'throw new RangeError("Indicator failed")' } },
                Malformed: { code: { update: 'const invalid = ;' } }
            }
        })
        send('exec-all-scripts', 'first', pane('Close'))
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
        send('exec-all-scripts', 'bad-first', pane('Broken'))
        send('exec-all-scripts', 'bad-second', pane('Broken'))
        release()
        await vi.waitFor(() => expect(replies.some(x => x.id === 'bad-second')).toBe(true))
        expect(replies.filter(x => x.type === 'command-error').map(x => ({ id: x.id, error: x.error.message })))
            .toEqual([
                { id: 'bad-first', error: 'Indicator failed' },
                { id: 'bad-second', error: 'Indicator failed' }
            ])
        expect(se.running).toBe(false)
        expect(replies.filter(x => x.type === 'engine-state').at(-1).data.running).toBe(false)

        send('exec-all-scripts', 'compile-error', pane('Malformed'))
        await vi.waitFor(() => expect(replies.find(x => x.id === 'compile-error')).toMatchObject({
            type: 'command-error', error: { message: expect.stringContaining('Cannot compile indicator "Malformed"') }
        }))
        send('exec-all-scripts', 'recovered', pane('Close'))
        await vi.waitFor(() => expect(replies.some(x => x.id === 'recovered')).toBe(true))
        se.map.a.env.output.update = () => { throw new Error('Live update failed') }
        send('update-data', 'live-error', { ohlcv: [[300000, 2, 2, 2, 2, 2]] })
        await vi.waitFor(() => expect(replies.find(x => x.id === 'live-error')).toMatchObject({
            type: 'command-error', error: { message: 'Live update failed' }
        }))
        send('upload-scripts', 'still-alive', { prefabs: {}, iScripts: {} })
        await vi.waitFor(() => expect(replies.find(x => x.id === 'still-alive')).toMatchObject({
            type: 'upload-scripts-done'
        }))
    } finally {
        post.mockRestore()
        pause.mockRestore()
    }
})
