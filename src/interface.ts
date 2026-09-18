// Vanilla JS interface

import { mount, unmount } from 'svelte'
import NightVisionComp from './NightVision.svelte'
import DataHub, { Data, Pane, Overlay } from './core/dataHub'
import MetaHub, { MetaHub as MetaHubType } from './core/metaHub'
import DataScan, { DataScanner as DataScanType } from './core/dataScanner'
import Scripts, { Scripts as ScriptsType } from './core/scripts'
import Events, { Events as EventsType } from './core/events'
import WebWork, { WebWork as WebWorkType } from './core/se/webWork'
import SeClient, { SeClient as SeClientType } from './core/se/seClient'

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

const activeChartIds = new Set<string>()
let nextChartId = 0

class NightVision {
    private _registered = false
    private _id: string
    private _data: Data
    private _scripts: Script[]
    private _props: Props
    private _scriptsReady: Promise<unknown>
    private _resizeCleanup: (() => void) | null = null
    public ww!: WebWorkType
    public se!: SeClientType
    public hub!: ReturnType<typeof DataHub.instance>
    public meta!: MetaHubType
    public scan!: DataScanType
    public events!: EventsType
    public scriptHub!: ScriptsType
    public root: HTMLElement | null
    public comp: ReturnType<typeof mount> | null = null
    private _pendingRemountRange: [number, number] | null = null

    constructor(target: string | HTMLElement, props: Props = {}) {
        this._data = props.data || {}
        this._scripts = props.scripts || []
        this._props = { ...props }

        if (props.indexBased !== undefined) {
            this._data.indexBased = props.indexBased
        }

        let id = props.id
        if (!id) {
            do {
                id = `nvjs-${++nextChartId}`
            } while (activeChartIds.has(id))
        }
        this._id = id
        this._props.id = id
        this._scriptsReady = Promise.resolve()
        this.root = typeof target === 'string' ? document.getElementById(target) : target
        if (!this.root) {
            console.warn(
                '[NightVision] Container not found:',
                target,
                '- ensure element exists when creating chart'
            )
            return
        }

        if (activeChartIds.has(id)) {
            throw new Error(`[NightVision] Chart ID is already in use: ${id}`)
        }
        activeChartIds.add(id)
        this._registered = true

        try {
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
            this._scriptsReady = this.scriptHub.init(this._scripts.map(s => s.code))
            this._props.scriptsReady = this._scriptsReady
            // Mount may not run before destruction rejects the worker request.
            void this._scriptsReady.catch(error => {
                if (this._registered && (error as Error)?.name !== 'AbortError') {
                    console.warn('[NightVision] Script upload failed:', error)
                }
            })

            if (props.autoResize) {
                this._syncSizeFromRoot()
            }
            this.comp = mount(NightVisionComp, {
                target: this.root,
                props: this._props
            })

            if (props.autoResize && this.root) {
                this._resizeCleanup = resizeTracker(
                    this as unknown as {
                        root: HTMLElement
                        width: number
                        height: number
                        resize: (width: number, height: number) => void
                    }
                )
            }

            this.se.setRefs(this.hub, this.scan)
        } catch (error) {
            this.destroy()
            throw error
        }
    }

    // *** PROPS ***
    // (see the default values in NightVision.svelte)

    // Chart container id (should be unique)
    get id(): string {
        return this._id
    }
    set id(val: string) {
        if (val !== this._id) {
            throw new Error('[NightVision] Chart ID cannot change after construction')
        }
    }

    // Width of the chart
    get width(): number | undefined {
        return this._props.width
    }
    set width(val: number) {
        if (this._sameSize(this._props.width, val)) return
        const range = this._rangeForWidth(val)
        this._props.width = val
        this._resizeMounted(range)
    }

    // Height of the chart
    get height(): number | undefined {
        return this._props.height
    }
    set height(val: number) {
        if (this._sameSize(this._props.height, val)) return
        const range = this._pendingRemountRange || this._copyRange()
        this._props.height = val
        this._resizeMounted(range)
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
        const scriptsReady = this.scriptHub.init(this._scripts.map(s => s.code))
        this._scriptsReady = scriptsReady
        this._props.scriptsReady = scriptsReady
        scriptsReady
            .then(() => {
                if (this._registered && this._scriptsReady === scriptsReady) {
                    this.update('full')
                }
            })
            .catch(e => {
                if (this._registered && e?.name !== 'AbortError') {
                    console.warn('[NightVision] Script upload failed:', e)
                }
            })
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
    _remount(range?: [number, number] | null): void {
        if (!this.root) return
        if (range) this._pendingRemountRange = range
        if (this.comp) {
            unmount(this.comp)
            this.comp = null
        }
        this.comp = mount(NightVisionComp, {
            target: this.root,
            props: this._props
        })
        setTimeout(() => {
            if (range) this._setRange(range, true)
            if (this._pendingRemountRange === range) this._pendingRemountRange = null
            this.update()
        })
    }

    _resizeMounted(range?: [number, number] | null): void {
        const comp = this.comp as any
        if (!comp || typeof comp.resize !== 'function') {
            this._remount(range)
            return
        }
        if (range) this._pendingRemountRange = range
        comp.resize(this._props.width ?? 750, this._props.height ?? 420)
        setTimeout(() => {
            if (range) this._setRange(range, true)
            if (this._pendingRemountRange === range) this._pendingRemountRange = null
            this.update()
        })
    }

    _setRange(range: [number, number], emit: boolean = false): void {
        const next = [range[0], range[1]] as [number, number] & { preventDefault?: boolean }
        next.preventDefault = !emit
        this.range = next
    }

    _copyRange(): [number, number] | null {
        const range = this.range
        if (!range?.length) return null
        return [range[0], range[1]]
    }

    _syncSizeFromRoot(): void {
        if (!this.root || typeof this.root.getBoundingClientRect !== 'function') return
        const rect = this.root.getBoundingClientRect()
        if (Number.isFinite(rect.width) && rect.width > 0) {
            this._props.width = rect.width
        }
        if (Number.isFinite(rect.height) && rect.height > 0) {
            this._props.height = rect.height
        }
    }

    _sameSize(a: number | undefined, b: number): boolean {
        return a !== undefined && Math.round(a) === Math.round(b)
    }

    _rangeForWidth(nextWidth: number): [number, number] | null {
        const range = this._copyRange()
        if (!range) return null

        const layout = this.layout as any
        const prevWidth = this._props.width ?? layout?.botbar?.width
        if (!prevWidth || !Number.isFinite(prevWidth) || prevWidth <= 0) return range

        const span = range[1] - range[0]
        if (!Number.isFinite(span) || span <= 0) return range

        const prevSpace = layout?.main?.spacex
        const nextSpace =
            prevSpace && Number.isFinite(prevSpace) && prevSpace > 0
                ? Math.max(1, prevSpace + (nextWidth - prevWidth))
                : nextWidth
        if (!Number.isFinite(nextSpace) || nextSpace <= 0) return range

        const nextSpan = span * (nextSpace / (prevSpace || prevWidth))
        const nextRange: [number, number] = [range[1] - nextSpan, range[1]]
        const main = this.hub.mainOv?.data
        const first = main?.[0]
        if (first) {
            const firstTi = this.hub.indexBased ? 0 : first[0]
            const interval = this.scan.interval || 1
            nextRange[0] = Math.max(nextRange[0], firstTi - interval * 0.5)
        }
        return nextRange
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

    resize(width: number, height: number): void {
        const widthChanged = !this._sameSize(this._props.width, width)
        const heightChanged = !this._sameSize(this._props.height, height)
        if (!widthChanged && !heightChanged) return

        const range = widthChanged ? this._rangeForWidth(width) : this._copyRange()
        this._props.width = width
        this._props.height = height
        this._resizeMounted(range)
    }

    // Various updates of the chart
    update(type: string = 'layout', opt: Record<string, any> = {}): void {
        if (!this._registered) return
        var [t, id] = type.split('-')
        const ev = this.events
        switch (t) {
            case 'layout':
                ev.emitSpec('chart', 'update-layout', opt)
                break
            case 'data':
                // TODO: update cursor if it's ahead of the last candle
                // (needs to track the new last)
                const range = this.range
                if (range) {
                    this.hub.updateRange(range)
                }
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
        if (!range) return
        let dti = range[1] - range[0]
        this.range = [ti - dti, ti]
    }

    // Scroll on interval forward
    // TODO: keep legend updated, when the cursor is outside
    scroll(): void {
        const cursor = this.cursor as { locked?: boolean } | null
        if (cursor?.locked) return
        let main = this.hub.mainOv?.data
        if (!main) return
        let last = main[main.length - 1]
        let ib = this.hub.indexBased
        if (!last) return
        let tl = ib ? main.length - 1 : last[0]
        const range = this.range
        if (!range) return
        let d = range[1] - tl
        let int = this.scan.interval
        if (d > 0) this.goto(range[1] + int)
    }

    // Should call this to clean-up memory / events
    destroy(): void {
        if (!this._registered) return
        this._registered = false
        activeChartIds.delete(this._id)
        if (this._resizeCleanup) {
            this._resizeCleanup()
            this._resizeCleanup = null
        }
        if (this.comp) {
            unmount(this.comp)
            this.comp = null
        }
        WebWork.release(this._id)
        SeClient.release(this._id)
        Scripts.release(this._id)
        MetaHub.release(this._id)
        DataScan.release(this._id)
        DataHub.release(this._id)
        Events.release(this._id)
        this.root = null
    }
}

export { NightVision }
