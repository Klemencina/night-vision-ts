// Client-side api for Script Engine. Emits/listens to se events

import DataHub from '../dataHub'
import type { OverlayUpdate } from './script_engine'

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
        if (!this.hub) return
        const ohlcv = this.hub.mainOv?.data || []
        let range: any
        try {
            range = this.chart?.range ?? this.scan?.defaultRange?.() ?? []
        } catch (_) {
            range = this.scan?.defaultRange?.() ?? []
        }
        if (!range?.length) {
            let main = ohlcv
            if (!main.length) {
                range = []
            } else if (this.hub?.data?.indexBased) {
                range = [0, main.length - 1]
            } else {
                range = [main[0][0], main[main.length - 1][0]]
            }
        }
        if (this.ww) {
            await this.ww.exec('upload-data', {
                meta: { range, tf: this.scan.tf },
                dss: { ohlcv }
            })
        }
    }

    async updateData(): Promise<void> {
        if (!this.hub?.mainOv?.data) return
        let ohlcv = this.hub.mainOv.data
        if (!this.ww) return
        const data: Record<string, OverlayUpdate> = await this.ww.exec('update-data', { ohlcv: ohlcv.slice(-2) })
        for (var ov of this.hub.allOverlays()) {
            const update = data[ov.uuid]
            if (!update) continue
            ov.data.length = update.start
            for (const row of update.data) ov.data.push(row)
        }
        // Visible subsets keep row references, including the previous live row.
        this.chart.update('data')
    }

    async execScripts(): Promise<void> {
        let list = this.hub.panes().map((x: any) => ({
            id: x.id,
            uuid: x.uuid,
            scripts: x.scripts
        }))
        if (this.ww) {
            await this.ww.exec('exec-all-scripts', list)
        }
    }

    async uploadAndExec(): Promise<void> {
        await this.uploadData()
        await this.execScripts()
    }

    replaceOverlays(data: any[]): void {
        for (var pane of this.hub.panes()) {
            pane.overlays = pane.overlays.filter((x: any) => !x.prod)
            let p = data.find(x => x.uuid === pane.uuid)
            if (p?.overlays) {
                pane.overlays.push(...p.overlays)
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
            if (this.hub?.data?.indexBased) {
                range = [0, main.length - 1]
            } else {
                range = [main[0][0], main[main.length - 1][0]]
            }
        }
        this.scan?.calcIndexOffsets()
        this.hub.calcSubset(range || [])
        this.chart.update()
        // Force grid remake so indicator panes (e.g. RSI) render script-produced overlays
        this.hub.events.emit('remake-grid')
    }

    updateOverlays(data: any[]): void {
        for (var pane of this.hub.panes()) {
            let p = data.find(x => x.uuid === pane.uuid)
            if (p?.overlays) {
                let ovs = pane.overlays.filter((x: any) => x.prod)
                let incoming = p.overlays.filter((x: any) => x.prod)
                for (var i = 0; i < ovs.length; i++) {
                    let dst = ovs[i]
                    let src = incoming[i]
                    if (dst && src) {
                        dst.name = src.name
                        dst.data = src.data
                        dst.uuid = src.uuid
                        dst.prod = src.prod
                        if (dst.props && src.props) {
                            Object.assign(dst.props, src.props)
                        } else if (src.props) {
                            dst.props = src.props
                        }
                        if (dst.settings && src.settings) {
                            Object.assign(dst.settings, src.settings)
                        } else if (src.settings) {
                            dst.settings = src.settings
                        }
                    }
                }
            }
        }
        this.chart.update('data', { updateHash: true })
    }

    onOverlayData(data: any[]): void {
        const sameDisposition = this.hub.panes().every((pane: any) => {
            const current = pane.overlays.filter((ov: any) => ov.prod)
            const incoming = (data.find(x => x.uuid === pane.uuid)?.overlays || [])
                .filter((ov: any) => ov.prod)
            return current.length === incoming.length && current.every((ov: any, i: number) =>
                ov.prod === incoming[i].prod && ov.type === incoming[i].type
            )
        })

        if (sameDisposition) {
            this.updateOverlays(data)
        } else {
            this.replaceOverlays(data)
        }
    }

    onEngineState(data: any): void {
        this.state = Object.assign(this.state || {}, data)
    }

    async updateScriptProps(delta: { [uuid: string]: { [key: string]: any } }): Promise<void> {
        if (!this.ww) return
        await this.ww.exec('exec-sel', delta)
    }
}

let instances: { [id: string]: SeClient } = Object.create(null)

function instance(id: string, chart?: Chart): SeClient {
    if (!instances[id]) {
        instances[id] = new SeClient(id, chart!)
    } else if (chart) {
        instances[id].chart = chart
        instances[id].ww = chart.ww
        if (instances[id].ww) {
            instances[id].ww.onevent = instances[id].onEvent.bind(instances[id])
        }
    }
    return instances[id]
}

function release(id: string): void {
    delete instances[id]
}

export { SeClient, instance, release }
export default { instance, release }
