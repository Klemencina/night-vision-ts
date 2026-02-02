// Data meta-analysis (detects starting range, interval, etc)
// + tracks changes in the pane/overlay order

import Utils from '../stuff/utils'
import DataHub from './dataHub'

class DataScanner {
    props: any
    hub: any
    all: any[]
    main: any[]
    tf: number
    interval: number
    ibMode: boolean
    panesHash: string

    constructor() {
        this.props = null
        this.hub = null
        this.all = []
        this.main = []
        this.tf = 0
        this.interval = 0
        this.ibMode = false
        this.panesHash = ''
    }

    init(props: any): number {
        this.props = props
        this.hub = DataHub.instance(props.id)
        return this.detectInterval()
    }

    detectInterval(): number {
        const panes = this.hub?.data?.panes
        if (!panes?.length) {
            this.all = []
            this.main = []
            this.tf = 0
            this.interval = 0
            this.ibMode = false
            return 0
        }

        this.all = Utils.allOverlays(panes)
        if (this.all.filter((x: any) => x.main).length > 1) {
            console.warn(`Two or more overlays with flagged as 'main'`)
        }
        let mainOv = this.all.find((x: any) => x.main) || this.all[0]
        mainOv = mainOv || {}
        this.main = mainOv.data || []
        let userTf = (mainOv.settings || {}).timeFrame
        if (userTf !== undefined) {
            this.tf = Utils.parseTf(userTf) || 0
        } else {
            this.tf = Utils.detectTimeframe(this.main)
        }
        this.interval = this.hub.data.indexBased ? 1 : this.tf
        this.ibMode = this.hub.data.indexBased

        return this.interval
    }

    getTimeframe(): number {
        return this.tf ?? 0
    }

    defaultRange(): number[] {
        if (!this.main?.length) return []

        const dl = this.props.config.DEFAULT_LEN
        const ml = this.props.config.MINIMUM_LEN + 0.5
        const l = this.main.length - 1

        if (this.main.length < 2) return []
        if (this.main.length <= dl) {
            var s = 0,
                d = ml
        } else {
            s = l - dl
            d = 0.5
        }
        if (!this.hub?.data?.indexBased) {
            return [this.main[s][0] - this.interval * d, this.main[l][0] + this.interval * ml]
        } else {
            return [s - this.interval * d, l + this.interval * ml]
        }
    }

    calcIndexOffsets(): void {
        if (!this.hub?.data?.indexBased || !this.all?.length) return
        for (var ov of this.all) {
            if (ov.data === this.main) {
                ov.indexOffset = ov.indexOffset ?? 0
                continue
            }
            let d = Utils.findIndexOffset(this.main, ov.data)
            ov.indexOffset = ov.indexOffset ?? d
        }
    }

    calcPanesHash(): string {
        let hash = ''
        for (var pane of this.hub?.data?.panes || []) {
            hash += pane.uuid
            for (var ov of pane.overlays || []) {
                hash += ov.uuid
            }
        }
        return hash
    }

    panesChanged(): boolean {
        let hash = this.calcPanesHash()
        return hash !== this.panesHash
    }

    updatePanesHash(): void {
        this.panesHash = this.calcPanesHash()
    }
}

let instances: { [id: string]: DataScanner } = {}

function instance(id: string): DataScanner {
    if (!instances[id]) {
        instances[id] = new DataScanner()
    }
    return instances[id]
}

export { DataScanner, instance }
export default { instance }
