// Web-worker

import se, { mergeDeltas } from './script_engine'
import Utils from '../../stuff/utils'
import * as u from './script_utils'
import { DatasetWW } from './dataset'

// Storage of indicators & overlays
;(self as any).scriptLib = {}

// Pane structure
;(self as any).paneStruct = {}

interface WorkerMessage {
    ids?: string[]
    data: {
        type: string
        id?: string
        data: any
    }
}

const pending: WorkerMessage[] = []
let processing = false

// Preserve command order while historical calculations yield to the event loop.
self.onmessage = (e: WorkerMessage) => {
    const command = { data: { ...e.data }, ids: e.data.id ? [e.data.id] : [] }
    const previous = pending[pending.length - 1]
    const type = command.data.type
    if (previous?.data.type === type && (type === 'exec-all-scripts' || type === 'exec-sel')) {
        previous.data.data = type === 'exec-sel'
            ? mergeDeltas([previous.data.data, command.data.data])
            : command.data.data
        previous.ids!.push(...command.ids)
    } else {
        pending.push(command)
    }
    void drain()
}

async function drain(): Promise<void> {
    if (processing) return
    processing = true
    try {
        while (pending.length) {
            const command = pending.shift()!
            try {
                await handleMessage(command)
            } catch (error) {
                console.error('[Worker] Command failed:', command.data.type, error)
            }
        }
    } finally {
        processing = false
    }
}

function complete(e: WorkerMessage, type: string): void {
    for (const id of e.ids || []) self.postMessage({ type, id, data: {} })
}

async function handleMessage(e: WorkerMessage): Promise<void> {
    switch (e.data.type) {
        case 'upload-scripts':
            ;(self as any).scriptLib = e.data.data
            self.postMessage({ type: 'upload-scripts-done', id: e.data.id, data: {} })
            break
        case 'send-meta-info':
            se.tf = u.tf_from_str(e.data.data.tf)
            se.range = e.data.data.range
            break
        case 'upload-data':
            se.tf = u.tf_from_str(e.data.data.meta.tf)
            se.range = e.data.data.meta.range
            for (var id in e.data.data.dss) {
                let data = e.data.data.dss[id]
                se.data[id] = new DatasetWW(id, data) as any
            }
            se.recalc_size()
            se.send('data-uploaded', {}, e.data.id)
            break
        case 'exec-all-scripts':
            ;(self as any).paneStruct = e.data.data
            await se.exec_all()
            complete(e, 'exec-all-scripts-done')
            break
        case 'update-data':
            DatasetWW.update_all(se, e.data.data)
            if (e.data.data.ohlcv) {
                se.update(e.data.data.ohlcv, e)
            }
            break
        case 'exec-sel':
            await se.exec_sel(e.data.data)
            complete(e, 'exec-sel-done')
            break
    }
}

// WW => DC
se.send = (type: string, data: any, id?: string) => {
    id = id ?? Utils.uuid()
    switch (type) {
        case 'data-uploaded':
        case 'overlay-data':
        case 'overlay-update':
        case 'engine-state':
        case 'modify-overlay':
        case 'module-data':
        case 'script-signal':
            self.postMessage({
                type,
                data,
                id
            })
            break
    }
}
