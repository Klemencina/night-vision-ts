// Webworker interface

import Utils from '../../stuff/utils'
import ScriptWorker from './worker?worker&inline'

// Deep clone to unwrap any Proxy objects (Svelte 5 $state)
function unwrapProxy(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj
    if (Array.isArray(obj)) {
        return obj.map(item => unwrapProxy(item))
    }
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        result[key] = unwrapProxy((obj as Record<string, unknown>)[key])
    }
    return result
}

interface PendingTask {
    resolve: (data: unknown) => void
    reject: (error: Error) => void
}

interface Message {
    type: string
    id: string
    data: unknown
}

class WebWork {
    chart: unknown
    tasks: { [id: string]: PendingTask }
    onevent: (e: MessageEvent) => void
    worker: Worker | null

    constructor(id: string, chart: unknown) {
        this.chart = chart
        this.tasks = Object.create(null)
        this.onevent = () => {}
        this.worker = null
        this.start()
    }

    start(): void {
        this.dispose(new DOMException('Worker restarted', 'AbortError'))
        const worker = this.worker = new ScriptWorker()
        worker.onmessage = e => {
            if (this.worker === worker) this.onmessage(e)
        }
        worker.onerror = e => {
            if (this.worker === worker) {
                this.dispose(new Error(e.message || 'Worker execution failed'))
            }
        }
        worker.onmessageerror = () => {
            if (this.worker === worker) {
                this.dispose(new Error('Worker response could not be decoded'))
            }
        }
    }

    startSocket(): void {
        // Socket implementation placeholder
    }

    send(msg: Message, txKeys?: string[]): void {
        if (!this.worker) {
            throw new Error(`Worker is not running; cannot execute "${msg.type}"`)
        }
        const unwrappedMsg = unwrapProxy(msg) as Message
        if (txKeys) {
            let txObjs = txKeys.map(k => (unwrappedMsg.data as Record<string, unknown>)[k])
            this.worker.postMessage(unwrappedMsg, txObjs as Transferable[])
        } else {
            this.worker.postMessage(unwrappedMsg)
        }
    }

    sendToNode(msg: Message, txKeys?: string[]): void {
        // Node.js socket implementation placeholder
    }

    onmessage(e: MessageEvent): void {
        const task = this.tasks[e.data?.id]
        if (task) {
            delete this.tasks[e.data.id]
            if (e.data.type === 'command-error') {
                const error = new Error(e.data.error?.message || 'Worker command failed')
                error.name = e.data.error?.name || 'Error'
                if (e.data.error?.stack) error.stack = e.data.error.stack
                task.reject(error)
            } else {
                task.resolve(e.data.data)
            }
        } else {
            this.onevent(e)
        }
    }

    async exec(type: string, data: unknown, txKeys?: string[]): Promise<unknown> {
        return this.relay({ type, id: Utils.uuid(), data, txKeys })
    }

    just(type: string, data: unknown, txKeys?: string[]): void {
        let id = Utils.uuid()
        this.send({ type, id, data }, txKeys)
    }

    async relay(event: Message & { txKeys?: string[] }, just = false): Promise<unknown> {
        if (just) {
            this.send(event, event.txKeys)
            return
        }
        return new Promise((resolve, reject) => {
            if (this.tasks[event.id]) {
                reject(new Error(`Worker request already pending: ${event.id}`))
                return
            }
            this.tasks[event.id] = { resolve, reject }
            try {
                this.send(event, event.txKeys)
            } catch (error) {
                delete this.tasks[event.id]
                reject(error)
            }
        })
    }

    stop(): void {
        this.dispose(new DOMException('Worker stopped', 'AbortError'))
        this.onevent = () => {}
    }

    private dispose(error: Error): void {
        if (this.worker) {
            this.worker.onmessage = null
            this.worker.onerror = null
            this.worker.onmessageerror = null
            this.worker.terminate()
            this.worker = null
        }
        const tasks = this.tasks
        this.tasks = Object.create(null)
        for (const task of Object.values(tasks)) task.reject(error)
    }
}

let instances: { [id: string]: WebWork } = Object.create(null)

function instance(id: string, chart: unknown): WebWork {
    if (!instances[id]) {
        instances[id] = new WebWork(id, chart)
    }
    return instances[id]
}

function release(id: string): void {
    const worker = instances[id]
    if (!worker) return
    worker.stop()
    delete instances[id]
}

export { WebWork, instance, release }
export default { instance, release }
