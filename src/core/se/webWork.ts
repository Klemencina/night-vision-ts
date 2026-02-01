
// Webworker interface

import Utils from '../../stuff/utils'

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

interface TaskCallback {
    (data: unknown): void
}

interface Message {
    type: string
    id: string
    data: unknown
}

class WebWork {
    chart: unknown
    tasks: { [id: string]: TaskCallback }
    onevent: (e: MessageEvent) => void
    worker: Worker | null

    constructor(id: string, chart: unknown) {
        this.chart = chart
        this.tasks = {}
        this.onevent = () => {}
        this.worker = null
        this.start()
    }

    start(): void {
        if (this.worker) this.worker.terminate()
        // Dynamic import to avoid TypeScript module resolution issues
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
            type: 'module'
        })
        this.worker.onmessage = e => this.onmessage(e)
    }

    startSocket(): void {
        // Socket implementation placeholder
    }

    send(msg: Message, txKeys?: string[]): void {
        const unwrappedMsg = unwrapProxy(msg) as Message
        if (txKeys && this.worker) {
            let txObjs = txKeys.map(k => (unwrappedMsg.data as Record<string, unknown>)[k])
            this.worker.postMessage(unwrappedMsg, txObjs as Transferable[])
        } else if (this.worker) {
            this.worker.postMessage(unwrappedMsg)
        }
    }

    sendToNode(msg: Message, txKeys?: string[]): void {
        // Node.js socket implementation placeholder
    }

    onmessage(e: MessageEvent): void {
        if (e.data.id in this.tasks) {
            this.tasks[e.data.id](e.data.data)
            delete this.tasks[e.data.id]
        } else {
            this.onevent(e)
        }
    }

    async exec(type: string, data: unknown, txKeys?: string[]): Promise<unknown> {
        return new Promise((rs) => {
            let id = Utils.uuid()
            this.send({ type, id, data }, txKeys)
            this.tasks[id] = res => {
                rs(res)
            }
        })
    }

    just(type: string, data: unknown, txKeys?: string[]): void {
        let id = Utils.uuid()
        this.send({ type, id, data }, txKeys)
    }

    async relay(event: Message & { txKeys?: string[] }, just = false): Promise<unknown> {
        return new Promise((rs) => {
            this.send(event, event.txKeys)
            if (!just) {
                this.tasks[event.id] = res => {
                    rs(res)
                }
            }
        })
    }

    stop(): void {
        if (this.worker) this.worker.terminate()
    }
}

let instances: { [id: string]: WebWork } = {}

function instance(id: string, chart: unknown): WebWork {
    if (!instances[id]) {
        instances[id] = new WebWork(id, chart)
    }
    return instances[id]
}

export default { instance }
