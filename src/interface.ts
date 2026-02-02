// Vanilla JS interface

import { mount, unmount, Component } from 'svelte'
import NightVisionComp from './NightVision.svelte'
import DataHub, { Data, Pane, Overlay } from './core/dataHub'
import MetaHub from './core/metaHub'
import DataScan from './core/dataScanner'
import Scripts from './core/scripts'
import Events from './core/events'
import WebWork from './core/se/webWork'
import SeClient from './core/se/seClient'

import resizeTracker from './stuff/resizeTracker'

// Re-export types for users
export type { Data, Pane, Overlay }

interface Colors {
    back?: string
    grid?: string
    text?: string
    textHL?: string
    scale?: string
    up?: string
    down?: string
    upWick?: string
    downWick?: string
    upVol?: string
    downVol?: string
    cross?: string
    cursor?: string
    line?: string
    [key: string]: string | undefined
}

interface ChartConfig {
    DEFAULT_LEN?: number
    MINIMUM_LEN?: number
    TOOLBAR?: number
    [key: string]: unknown
}

interface Script {
    name: string
    code: string
    [key: string]: unknown
}

interface Props {
    data?: Data
    scripts?: Script[]
    id?: string
    width?: number
    height?: number
    colors?: Colors
    showLogo?: boolean
    config?: ChartConfig
    indexBased?: boolean
    timezone?: number
    autoResize?: boolean
    scriptsReady?: Promise<unknown>
    [key: string]: unknown
}

class NightVision {
    private _data: Data
    private _scripts: Script[]
    private _props: Props
    private _scriptsReady: Promise<unknown>
    public ww: WebWork
    public se: SeClient
    public hub: DataHub
    public meta: MetaHub
    public scan: DataScan
    public events: Events
    public scriptHub: Scripts
    public root: HTMLElement | null
    public comp: ReturnType<typeof mount> | null

    constructor(target: string | HTMLElement, props: Props = {}) {
        this._data = props.data || {}
        this._scripts = props.scripts || []
        this._props = { ...props }

        if (props.indexBased !== undefined) {
            this._data.indexBased = props.indexBased
        }

        let id = props.id || 'nvjs'

        // Script engine & web-worker interfaces
        this.ww = WebWork.instance(id, this)
        this.se = SeClient.instance(id, this)

        // Singleton stores for data & scripts
        this.hub = DataHub.instance(id)
        this.meta = MetaHub.instance(id)
        this.scan = DataScan.instance(id)
        this.events = Events.instance(id)
        this.scriptHub = Scripts.instance(id)
        this.hub.init(this._data)
        this._scriptsReady = this.scriptHub.init(this._scripts)
        this._props.scriptsReady = this._scriptsReady

        this.root = typeof target === 'string' ? document.getElementById(target) : target
        if (!this.root) {
            console.warn(
                '[NightVision] Container not found:',
                target,
                '- ensure element exists when creating chart'
            )
            return
        }
        this.comp = mount(NightVisionComp, {
            target: this.root,
            props: this._props
        })

        // TODO: remove the observer on chart destroy
        if (props.autoResize && this.root) {
            resizeTracker(this as unknown as HTMLElement)
        }

        this.se.setRefs(this.hub, this.scan)
    }

    // *** PROPS ***
    // (see the default values in NightVision.svelte)

    // Chart container id (should be unique)
    get id(): string | undefined {
        return this._props.id
    }
    set id(val: string) {
        this._props.id = val
        this._remount()
    }

    // Width of the chart
    get width(): number | undefined {
        return this._props.width
    }
    set width(val: number) {
        this._props.width = val
        this._remount()
        setTimeout(() => this.update())
    }

    // Height of the chart
    get height(): number | undefined {
        return this._props.height
    }
    set height(val: number) {
        this._props.height = val
        this._remount()
        setTimeout(() => this.update())
    }

    // Colors (modify specific colors)
    // TODO: not reactive enough
    get colors(): Colors | undefined {
        return this._props.colors
    }
    set colors(val: Colors) {
        this._props.colors = val
        this._remount()
    }

    // Show NV logo or not
    get showLogo(): boolean | undefined {
        return this._props.showLogo
    }
    set showLogo(val: boolean) {
        this._props.showLogo = val
        this._remount()
    }

    // User-defined scripts (overlays & indicators)
    get scripts(): Script[] {
        return this._scripts
    }
    set scripts(val: Script[]) {
        this._scripts = val
        this.scriptHub.init(this._scripts)
        this.update('full')
    }

    // The data (auto-updated on reset)
    get data(): Data {
        return this._data
    }
    set data(val: Data) {
        this._data = val
        if (this._props.indexBased !== undefined) {
            this._data.indexBased = this._props.indexBased
        }
        this.update('full')
    }

    // Overwrites the default config values
    get config(): ChartConfig | undefined {
        return this._props.config
    }
    set config(val: ChartConfig) {
        this._props.config = val
        this._remount()
    }

    // Index-based mode of rendering
    get indexBased(): boolean | undefined {
        return this._props.indexBased
    }
    set indexBased(val: boolean) {
        this._props.indexBased = val
        this._data.indexBased = val
        this._remount()
    }

    // Timezone (Shift from UTC, hours)
    get timezone(): number | undefined {
        return this._props.timezone
    }
    set timezone(val: number) {
        this._props.timezone = val
        this._remount()
        setTimeout(() => this.update())
    }

    // Remount component with new props (Svelte 5 way to update props from outside)
    _remount(): void {
        if (!this.root) return
        unmount(this.comp)
        this.comp = mount(NightVisionComp, {
            target: this.root,
            props: this._props
        })
    }

    // *** Internal variables ***

    get layout(): unknown {
        try {
            let chart = (this.comp as any)?.getChart?.()
            if (!chart || typeof chart.getLayout !== 'function') return null
            return chart.getLayout()
        } catch (_) {
            return null
        }
    }

    get range(): [number, number] | null {
        try {
            let chart = (this.comp as any)?.getChart?.()
            if (!chart || typeof chart.getRange !== 'function') return null
            return chart.getRange()
        } catch (_) {
            return null
        }
    }

    set range(val: [number, number]) {
        let chart = (this.comp as any)?.getChart?.()
        if (!chart || typeof chart.setRange !== 'function') return
        chart.setRange(val)
    }

    get cursor(): unknown {
        try {
            let chart = (this.comp as any)?.getChart?.()
            if (!chart || typeof chart.getCursor !== 'function') return null
            return chart.getCursor()
        } catch (_) {
            return null
        }
    }

    set cursor(val: unknown) {
        let chart = (this.comp as any)?.getChart?.()
        if (!chart || typeof chart.setCursor !== 'function') return
        chart.setCursor(val)
    }

    // *** METHODS ***

    // Various updates of the chart
    update(type: string = 'layout', opt: Record<string, any> = {}): void {
        var [t, id] = type.split('-')
        const ev = this.events
        switch (t) {
            case 'layout':
                ev.emitSpec('chart', 'update-layout', opt)
                break
            case 'data':
                // TODO: update cursor if it's ahead of the last candle
                // (needs to track the new last)
                this.hub.updateRange(this.range)
                this.meta.calcOhlcMap()
                ev.emitSpec('chart', 'update-layout', opt)
                break
            case 'full':
                this.hub.init(this._data)
                ev.emitSpec('chart', 'full-update', opt)
                break
            case 'grid':
                if (id === undefined) {
                    ev.emit('remake-grid')
                } else {
                    let gridId = `grid-${id}`
                    ev.emitSpec(gridId, 'remake-grid', opt)
                }
                break
            case 'legend':
                if (id === undefined) {
                    ev.emit('update-legend')
                } else {
                    let gridId = `legend-${id}`
                    ev.emitSpec(gridId, 'update-legend', opt)
                }
                break
        }
    }

    // Reset everything
    fullReset(): void {
        this.update('full', { resetRange: true })
    }

    // Go to time/index
    goto(ti: number): void {
        let range = this.range
        let dti = range[1] - range[0]
        this.range = [ti - dti, ti]
    }

    // Scroll on interval forward
    // TODO: keep legend updated, when the cursor is outside
    scroll(): void {
        if (this.cursor.locked) return
        let main = this.hub.mainOv.data
        let last = main[main.length - 1]
        let ib = this.hub.indexBased
        if (!last) return
        let tl = ib ? main.length - 1 : last[0]
        let d = this.range[1] - tl
        let int = this.scan.interval
        if (d > 0) this.goto(this.range[1] + int)
    }

    // Should call this to clean-up memory / events
    destroy(): void {
        unmount(this.comp)
        this.ww.stop()
    }
}

export { NightVision }
