import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebWork } from '../../src/core/se/webWork'

interface WorkerStub {
    onmessage: ((event: MessageEvent) => void) | null
    onerror: ((event: ErrorEvent) => void) | null
    onmessageerror: ((event: MessageEvent) => void) | null
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
}

const workers = vi.hoisted(() => [] as WorkerStub[])

vi.mock('../../src/core/se/worker?worker&inline', () => ({
    default: class {
        onmessage = null
        onerror = null
        onmessageerror = null
        postMessage = vi.fn()
        terminate = vi.fn()

        constructor() {
            workers.push(this)
        }
    }
}))

beforeEach(() => workers.splice(0))

describe('worker requests', () => {
    it('rejects command errors and accepts subsequent responses', async () => {
        const transport = new WebWork('chart', null)
        const worker = workers[0]
        const failed = transport.exec('exec-all-scripts', {})
        const rejection = expect(failed).rejects.toMatchObject({
            name: 'RangeError', message: 'Invalid indicator length'
        })
        const request = worker.postMessage.mock.calls[0][0]
        worker.onmessage!({ data: {
            id: request.id, type: 'command-error',
            error: { name: 'RangeError', message: 'Invalid indicator length' }
        } } as MessageEvent)
        await rejection
        expect(Object.keys(transport.tasks)).toEqual([])

        const success = transport.exec('upload-data', {})
        const next = worker.postMessage.mock.calls[1][0]
        worker.onmessage!({ data: { id: next.id, type: 'data-uploaded', data: { ok: true } } } as MessageEvent)
        await expect(success).resolves.toEqual({ ok: true })
        transport.stop()
    })

    it.each(['error', 'messageerror'] as const)('rejects all requests on worker %s', async kind => {
        const transport = new WebWork('chart', null)
        const worker = workers[0]
        const first = expect(transport.exec('first', {})).rejects.toThrow()
        const second = expect(transport.exec('second', {})).rejects.toThrow()
        if (kind === 'error') worker.onerror!(new ErrorEvent('error', { message: 'Load failed' }))
        else worker.onmessageerror!(new MessageEvent('messageerror'))
        await Promise.all([first, second])
        expect(worker.terminate).toHaveBeenCalledOnce()
        expect(transport.worker).toBeNull()
        expect(Object.keys(transport.tasks)).toEqual([])
        await expect(transport.exec('later', {})).rejects.toThrow('Worker is not running')
    })

    it.each(['stop', 'start'] as const)('rejects pending requests on %s', async action => {
        const transport = new WebWork('chart', null)
        const worker = workers[0]
        const rejected = expect(transport.exec('pending', {})).rejects.toMatchObject({ name: 'AbortError' })
        transport[action]()
        await rejected
        expect(worker.terminate).toHaveBeenCalledOnce()
        expect(Object.keys(transport.tasks)).toEqual([])
        if (action === 'start') {
            expect(workers).toHaveLength(2)
            expect(transport.worker).toBe(workers[1])
            transport.stop()
        }
    })

    it('cleans up failed sends and settles fire-and-forget relay calls', async () => {
        const transport = new WebWork('chart', null)
        workers[0].postMessage.mockImplementationOnce(() => {
            throw new DOMException('Cannot clone request', 'DataCloneError')
        })
        await expect(transport.exec('upload-data', {})).rejects.toMatchObject({ name: 'DataCloneError' })
        expect(Object.keys(transport.tasks)).toEqual([])
        await expect(transport.relay({ id: 'relay', type: 'send-meta-info', data: {} }, true))
            .resolves.toBeUndefined()
        expect(Object.keys(transport.tasks)).toEqual([])
        transport.stop()
        await expect(transport.relay({ id: 'stopped', type: 'upload-data', data: {} }))
            .rejects.toThrow('Worker is not running')
        expect(Object.keys(transport.tasks)).toEqual([])
    })

})
