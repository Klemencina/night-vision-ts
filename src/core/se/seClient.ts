// Client-side api for Script Engine. Emits/listens to se events

import DataHub from '../dataHub'
import Utils from '../../stuff/utils'

interface Chart {
    ww: WebWork | null
    range?: any
    update: (type?: string, opts?: any) => void
}

interface WebWork {
    onevent: (e: any) => void
    exec: (type: string, data: any) => Promise<any>
}

interface PaneData {
    id: string
    uuid: string
    overlays?: any[]
}

class SeClient {
    chart: Chart
    ww: WebWork | null
    hub: any
    scan: any
    state: any

    constructor(id: string, chart: Chart) {
        this.chart = chart
        this.ww = chart?.ww || null
        if (this.ww) {
            this.ww.onevent = this.onEvent.bind(this)
        }
    }

    setRefs(hub: any, scan: any): void {
        this.hub = hub
        this.scan = scan
    }

    onEvent(e: any): void {
        switch (e.data?.type) {
            case 'overlay-data':
                this.onOverlayData(e.data.data)
                break
            case 'engine-state':
                this.onEngineState(e.data.data)
                break
        }
    }

    async uploadData(): Promise<void> {
        if (!this.hub?.mainOv?.data?.length) return
        let range: any
        try {
            range = this.chart?.range ?? this.scan?.defaultRange?.() ?? []
        } catch (_) {
            range = this.scan?.defaultRange?.() ?? []
        }
        if (!range?.length) {
            let main = this.hub.mainOv.data
            range = [main[0][0], main[main.length - 1][0]]
        }
        if (this.ww) {
            await this.ww.exec('upload-data', {
                meta: { range, tf: this.scan.tf },
                dss: { ohlcv: this.hub.mainOv.data }
            })
        }
    }

    async updateData(): Promise<void> {
        if (!this.hub?.mainOv?.data) return
        let ohlcv = this.hub.mainOv.data
        if (!this.ww) return
        let data = await this.ww.exec('update-data', { ohlcv: ohlcv.slice(-2) })
        let unshift = false
        for (var ov of this.hub.allOverlays()) {
            if (data[ov.uuid]) {
                let last = ov.data[ov.data.length - 1]
                let nw = data[ov.uuid]
                if (!last || nw[0] > last[0]) {
                    ov.data.push(nw)
                    unshift = true
                } else if (nw[0] === last[0]) {
                    ov.data[ov.data.length - 1] = nw
                }
            }
        }
        if (unshift) {
            this.chart.update('data')
        } else {
            this.chart.update()
        }
    }

    async execScripts(): Promise<void> {
        let list = this.hub.panes().map((x: any) => ({
            id: x.id,
            uuid: x.uuid,
            scripts: x.scripts
        }))
        console.log(
            '[SeClient] execScripts: sending panes:',
            list.length,
            'pane uuids:',
            list.map(p => p.uuid)
        )
        console.log(
            '[SeClient] execScripts: scripts per pane:',
            list.map(p => p.scripts?.length || 0)
        )
        if (this.ww) {
            await this.ww.exec('exec-all-scripts', list)
        }
    }

    async uploadAndExec(): Promise<void> {
        await this.uploadData()
        await this.execScripts()
    }

    replaceOverlays(data: any[]): void {
        console.log(
            '[SeClient] replaceOverlays: data panes:',
            data.length,
            'hub panes:',
            this.hub.panes().length
        )
        for (var pane of this.hub.panes()) {
            pane.overlays = pane.overlays.filter((x: any) => !x.prod)
            let p = data.find(x => x.uuid === pane.uuid)
            console.log(
                '[SeClient] replaceOverlays: pane uuid:',
                pane.uuid,
                'found in data:',
                !!p,
                'overlays to add:',
                p?.overlays?.length || 0
            )
            if (p?.overlays) {
                pane.overlays.push(...p.overlays)
                console.log(
                    '[SeClient] replaceOverlays: added',
                    p.overlays.length,
                    'overlays to pane',
                    pane.id
                )
            }
        }
        let range: any
        try {
            range = this.chart?.range ?? this.scan?.defaultRange?.() ?? []
        } catch (_) {
            range = this.scan?.defaultRange?.() ?? []
        }
        if (!range?.length && this.hub?.mainOv?.data?.length) {
            let main = this.hub.mainOv.data
            range = [main[0][0], main[main.length - 1][0]]
        }
        console.log('[SeClient] replaceOverlays: calling calcSubset with range:', range)
        if (range?.length) {
            this.hub.calcSubset(range)
        }
        this.chart.update()
        // Force grid remake so indicator panes (e.g. RSI) render script-produced overlays
        this.hub.events.emit('remake-grid')
    }

    updateOverlays(data: any[]): void {
        for (var pane of this.hub.panes()) {
            let p = data.find(x => x.uuid === pane.uuid)
            if (p?.overlays) {
                let ovs = pane.overlays.filter((x: any) => x.prod)
                for (var i = 0; i < ovs.length; i++) {
                    let dst = ovs[i]
                    let src = p.overlays[i]
                    if (dst && src) {
                        dst.name = src.name
                        dst.data = src.data
                        dst.uuid = src.uuid
                    }
                }
            }
        }
        this.chart.update('data', { updateHash: true })
    }

    onOverlayData(data: any[]): void {
        let h1 = Utils.ovDispositionHash(this.hub.panes())
        let h2 = Utils.ovDispositionHash(data)
        console.log(
            '[SeClient] onOverlayData: received panes:',
            data.length,
            'hashes match:',
            h1 === h2
        )
        console.log(
            '[SeClient] onOverlayData: received overlays per pane:',
            data.map(p => p.overlays?.length || 0)
        )
        console.log(
            '[SeClient] onOverlayData: current hub overlays per pane:',
            this.hub.panes().map(p => p.overlays?.length || 0)
        )

        if (h1 === h2) {
            this.updateOverlays(data)
        } else {
            this.replaceOverlays(data)
        }
    }

    onEngineState(data: any): void {
        this.state = Object.assign(this.state || {}, data)
    }
}

let instances: { [id: string]: SeClient } = {}

function instance(id: string, chart?: Chart): SeClient {
    if (!instances[id]) {
        instances[id] = new SeClient(id, chart!)
    } else if (chart && !instances[id].chart) {
        instances[id].chart = chart
        instances[id].ww = chart.ww
        if (instances[id].ww) {
            instances[id].ww.onevent = instances[id].onEvent.bind(instances[id])
        }
    }
    return instances[id]
}

export default { instance }
