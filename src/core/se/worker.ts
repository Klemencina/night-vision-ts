
// Web-worker

import se from './script_engine'
import Utils from '../../stuff/utils'
import * as u from './script_utils'
import { DatasetWW } from './dataset'

// Storage of indicators & overlays
(self as any).scriptLib = {};

// Pane structure
(self as any).paneStruct = {}

interface WorkerMessage {
    data: {
        type: string
        id?: string
        data: any
    }
}

// DC => WW
self.onmessage = async (e: WorkerMessage) => {
    switch (e.data.type) {
        case 'upload-scripts':
            (self as any).scriptLib = e.data.data
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
                se.data[id] = new DatasetWW(id, data)
            }
            se.recalc_size()
            se.send('data-uploaded', {}, e.data.id)
            break
        case 'exec-all-scripts': {
            const reqId = e.data.id
            // Don't overwrite paneStruct while run() is in progress or map/format_data use wrong data
            if (!(se as any).running) {
                ;(self as any).paneStruct = e.data.data
            }
            try {
                await se.exec_all()
            } catch (err) {
                console.error('[Worker] exec_all failed:', err)
                // Still send overlay-data so client gets current state
                const paneStruct = (self as any).paneStruct || []
                se.send('overlay-data', paneStruct.map((x: any) => ({ id: x.id, uuid: x.uuid, overlays: x.overlays || [] })))
            }
            self.postMessage({ type: 'exec-all-scripts-done', id: reqId, data: {} })
            break
        }
        case 'update-data':
            DatasetWW.update_all(se, e.data.data)
            if (e.data.data.ohlcv) {
                se.update(e.data.data.ohlcv, e)
            }
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
