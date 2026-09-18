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
