// Vanilla JS interface

import { mount, unmount, tick } from 'svelte'
import NightVisionComp from './NightVision.svelte'
import DataHub, { Data, Pane, Overlay } from './core/dataHub'
import MetaHub, { MetaHub as MetaHubType } from './core/metaHub'
import DataScan, { DataScanner as DataScanType } from './core/dataScanner'
import Scripts, { Scripts as ScriptsType } from './core/scripts'
import Events, { Events as EventsType } from './core/events'
import WebWork, { WebWork as WebWorkType } from './core/se/webWork'
import SeClient, { SeClient as SeClientType } from './core/se/seClient'

import resizeTracker from './stuff/resizeTracker'
import Utils from './stuff/utils'
import { copyOverlay, copyOverlayPoint, copyIndicator, copyPane, findTarget, resetRangeOption, validateOverlayData, type IndicatorInput, type IndicatorPatch, type OverlayRow, type DataTarget, type DataUpdateOptions, type OverlayInput, type OverlayPatch, type PaneInput, type PanePatch } from './core/paneData'
import { copyCandle, copySeries, type Candle, type SetSeriesOptions } from './core/candleData'

// Re-export types for users
export type { Data, Pane, Overlay }
export type { Candle, SetSeriesOptions }
export type { IndicatorInput, IndicatorPatch, DataTarget, DataUpdateOptions, OverlayInput, OverlayPatch, OverlayRow, PaneInput, PanePatch } from './core/paneData'

interface DataChart {
    whenReady(): Promise<void>
    fullUpdate(options: SetSeriesOptions): Promise<void>
}

export interface Colors {
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

export interface ChartConfig {
    DEFAULT_LEN?: number
    MINIMUM_LEN?: number
    TOOLBAR?: number
    [key: string]: unknown
}

interface Script {
    name?: string
    code: string
    [key: string]: unknown
}

export interface NightVisionProps {
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
    private _props: NightVisionProps
    private _scriptsReady: Promise<unknown>
    private _resizeCleanup: (() => void) | null = null
    private _timers = new Set<ReturnType<typeof setTimeout>>()
    private _dataQueue: Promise<void> = Promise.resolve()
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

    constructor(target: string | HTMLElement, props: NightVisionProps = {}) {
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
        this._defer(() => this.update())
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
        this._defer(() => {
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
        this._defer(() => {
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

    private _defer(callback: () => void): void {
        if (!this._registered) return
        const timer = setTimeout(() => {
            this._timers.delete(timer)
            if (this._registered) callback()
        })
        this._timers.add(timer)
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

    /** Replace the main candle series and recalculate indicators. */
    async setSeries(rows: readonly Candle[], options: SetSeriesOptions = {}): Promise<void> {
        this._assertActive()
        const data = copySeries(rows)
        const resetRange = options.resetRange ?? true
        if (typeof resetRange !== 'boolean') {
            throw new TypeError('resetRange must be a boolean')
        }
        return this._queueData(async chart => {
            const overlay = this._candleOverlay()
            overlay.data = data
            await chart.fullUpdate({ resetRange })
        })
    }

    /** Replace the latest candle at the same timestamp, or append a newer candle. */
    async updateCandle(row: Candle): Promise<void> {
        this._assertActive()
        const candle = copyCandle(row)
        return this._queueData(async chart => {
            const overlay = this._candleOverlay()
            const data = overlay.data || (overlay.data = [])
            const last = data[data.length - 1]
            if (last && candle[0] < last[0]) {
                throw new RangeError('Cannot update an older candle; use setSeries to replace history')
            }
            const previousLength = data.length
            if (last && candle[0] === last[0]) data[data.length - 1] = candle
            else data.push(candle)

            // Rebuild the timeframe and worker state when starting an empty series.
            if (previousLength < 2) await chart.fullUpdate({ resetRange: !this.range?.length })
            else await this.se.updateData()
        })
    }

    /** Append a pane and return its stable UUID. */
    async addPane(input: PaneInput = {}, options: DataUpdateOptions = {}): Promise<string> {
        this._assertActive()
        const pane = copyPane(input)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            pane.uuid = Utils.uuid3()
            for (const overlay of pane.overlays || []) overlay.uuid = Utils.uuid3()
            const main = pane.overlays?.find(overlay => overlay.main)
            if (main) this._selectMain(main)
            ;(this._data.panes ||= []).push(pane)
            await this._refreshData(chart, resetRange)
            return pane.uuid!
        })
    }

    /** Shallow-merge pane settings without changing its identity or contents. */
    async updatePane(target: DataTarget, patch: PanePatch, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const next = copyPane(patch, true)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const pane = findTarget(this._data.panes || [], target, 'Pane')
            if (next.settings) pane.settings = { ...pane.settings, ...next.settings }
            await this._refreshData(chart, resetRange)
        })
    }

    /** Remove a pane, including its overlays and indicator scripts. */
    async removePane(target: DataTarget, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const panes = this._data.panes || []
            const pane = findTarget(panes, target, 'Pane')
            panes.splice(panes.indexOf(pane), 1)
            await this._refreshData(chart, resetRange)
        })
    }

    /** Append an overlay to a pane and return its stable UUID. */
    async addOverlay(target: DataTarget, input: OverlayInput, options: DataUpdateOptions = {}): Promise<string> {
        this._assertActive()
        const overlay = copyOverlay(input, true)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const pane = findTarget(this._data.panes || [], target, 'Pane')
            overlay.uuid = Utils.uuid3()
            if (overlay.main) this._selectMain(overlay)
            ;(pane.overlays ||= []).push(overlay)
            await this._refreshData(chart, resetRange)
            return overlay.uuid!
        })
    }

    /** Replace supplied fields; shallow-merge settings and props. */
    async updateOverlay(paneTarget: DataTarget, target: DataTarget, patch: OverlayPatch, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const next = copyOverlay(patch)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const overlay = this._editableOverlay(paneTarget, target)
            if (next.type !== undefined || next.data !== undefined) {
                validateOverlayData(next.type ?? overlay.type, next.data ?? overlay.data ?? [])
            }
            if (next.main) this._selectMain(overlay)
            const settings = next.settings ? { ...overlay.settings, ...next.settings } : overlay.settings
            const props = next.props ? { ...overlay.props, ...next.props } : overlay.props
            Object.assign(overlay, next, { settings, props })
            await this._refreshData(chart, resetRange)
        })
    }

    /** Remove a user-supplied overlay. Its pane remains in the dataset. */
    async removeOverlay(paneTarget: DataTarget, target: DataTarget, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const overlay = this._editableOverlay(paneTarget, target)
            const pane = findTarget(this._data.panes || [], paneTarget, 'Pane')
            pane.overlays!.splice(pane.overlays!.indexOf(overlay), 1)
            await this._refreshData(chart, resetRange)
        })
    }

    /** Replace the latest overlay row at the same timestamp, or append a newer row. */
    async updateOverlayPoint(paneTarget: DataTarget, target: DataTarget, row: OverlayRow): Promise<void> {
        this._assertActive()
        const point = copyOverlayPoint(row)
        return this._queueData(async chart => {
            const overlay = this._editableOverlay(paneTarget, target)
            validateOverlayData(overlay.type, [point])
            const data = overlay.data || []
            const last = data[data.length - 1]
            if (last && (point[0] as number) < last[0]) {
                throw new RangeError('Cannot update an older overlay point; use updateOverlay to replace history')
            }
            const previousLength = data.length
            if (last && point[0] === last[0]) data[data.length - 1] = point
            else data.push(point)
            overlay.data = data
            this.hub.detectMain()
            if (overlay === this.hub.mainOv) {
                if (previousLength < 2) await chart.fullUpdate({ resetRange: !this.range?.length })
                else await this.se.updateData()
            } else {
                this.update('data')
            }
        })
    }

    /** Add a registered indicator to a pane and return its stable script UUID. */
    async addIndicator(paneTarget: DataTarget, input: IndicatorInput, options: DataUpdateOptions = {}): Promise<string> {
        this._assertActive()
        const indicator = copyIndicator(input, true)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const pane = findTarget(this._data.panes || [], paneTarget, 'Pane')
            this._assertIndicatorType(indicator.type)
            indicator.uuid = Utils.uuid3()
            ;(pane.scripts ||= []).push(indicator)
            await this._refreshData(chart, resetRange)
            return indicator.uuid!
        })
    }

    /** Update an indicator definition and recalculate its generated overlays. */
    async updateIndicator(paneTarget: DataTarget, target: DataTarget, patch: IndicatorPatch, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const next = copyIndicator(patch)
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const pane = findTarget(this._data.panes || [], paneTarget, 'Pane')
            const indicator = findTarget(pane.scripts || [], target, 'Indicator')
            this._assertIndicatorType(next.type ?? indicator.type)
            const settings = next.settings ? { ...indicator.settings, ...next.settings } : indicator.settings
            const props = next.props ? { ...indicator.props, ...next.props } : indicator.props
            Object.assign(indicator, next, { settings, props })
            await this._refreshData(chart, resetRange)
        })
    }

    /** Remove an indicator and all overlays it generated, keeping its pane. */
    async removeIndicator(paneTarget: DataTarget, target: DataTarget, options: DataUpdateOptions = {}): Promise<void> {
        this._assertActive()
        const resetRange = resetRangeOption(options)
        return this._queueData(async chart => {
            const pane = findTarget(this._data.panes || [], paneTarget, 'Pane')
            const indicator = findTarget(pane.scripts || [], target, 'Indicator')
            pane.scripts!.splice(pane.scripts!.indexOf(indicator), 1)
            for (const current of this._data.panes || []) {
                current.overlays = (current.overlays || []).filter(overlay =>
                    !indicator.uuid || overlay.prod !== indicator.uuid)
            }
            await this._refreshData(chart, resetRange)
        })
    }

    private _assertIndicatorType(type: string | undefined): void {
        if (!type || !Object.prototype.hasOwnProperty.call(this.scriptHub.iScripts, type)) {
            throw new RangeError(`Unknown indicator type: ${type}`)
        }
    }

    private async _refreshData(chart: DataChart, resetRange: boolean): Promise<void> {
        const panes = this._data.panes || []
        const authored = panes.flatMap(pane => pane.overlays || [])
            .filter(overlay => !overlay.prod)
        const main = authored.find(overlay => overlay.main) || authored[0]
        if (main) {
            this._selectMain(main)
            main.main = true
        } else {
            // Derived overlays cannot keep a removed source series alive.
            for (const pane of panes) pane.overlays = []
        }
        await chart.fullUpdate({ resetRange })
    }

    private _editableOverlay(paneTarget: DataTarget, target: DataTarget): Overlay {
        const pane = findTarget(this._data.panes || [], paneTarget, 'Pane')
        const overlay = findTarget(pane.overlays || [], target, 'Overlay')
        if (overlay.prod) {
            throw new TypeError('Script-produced overlays must be managed through their indicator scripts')
        }
        return overlay
    }

    private _selectMain(overlay: Overlay): void {
        for (const pane of this._data.panes || []) {
            for (const current of pane.overlays || []) current.main = current === overlay
        }
    }

    private _assertActive(): void {
        if (!this._registered) {
            throw new DOMException('Chart is not mounted or has been destroyed', 'AbortError')
        }
    }

    private _queueData<T>(operation: (chart: DataChart) => Promise<T>): Promise<T> {
        const pending = this._dataQueue.then(async () => {
            this._assertActive()
            await tick()
            this._assertActive()
            const comp = this.comp as unknown as { getChart(): DataChart }
            const chart = comp.getChart()
            await chart.whenReady()
            await this._scriptsReady
            this._assertActive()
            const result = await operation(chart)
            this._assertActive()
            await tick()
            return result
        })
        // A rejected request must not prevent later valid updates.
        this._dataQueue = pending.then(() => {}, () => {})
        return pending
    }

    private _candleOverlay(): Overlay {
        this.hub.detectMain()
        const main = this.hub.mainOv
        if (main) {
            if (main.type !== 'Candles' && main.type !== 'CandlesPlus') {
                throw new TypeError('The main overlay must use Candles or CandlesPlus')
            }
            return main
        }
        const panes = this._data.panes || (this._data.panes = [])
        if (!panes.length) panes.push({ overlays: [] })
        const overlays = panes[0].overlays || (panes[0].overlays = [])
        const overlay: Overlay = { name: 'Candles', type: 'Candles', main: true, data: [] }
        overlays.unshift(overlay)
        this.hub.init(this._data)
        return overlay
    }

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
                this.scan.calcIndexOffsets()
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
        for (const timer of this._timers) clearTimeout(timer)
        this._timers.clear()
        const resizeCleanup = this._resizeCleanup
        const comp = this.comp
        this._resizeCleanup = null
        this.comp = null
        this._pendingRemountRange = null
        this.root = null
        const cleanups = [
            () => resizeCleanup?.(),
            () => {
                if (comp) {
                    Promise.resolve(unmount(comp)).catch(error => {
                        console.warn('[NightVision] Component cleanup failed:', error)
                    })
                }
            },
            () => WebWork.release(this._id),
            () => SeClient.release(this._id),
            () => Scripts.release(this._id),
            () => MetaHub.release(this._id),
            () => DataScan.release(this._id),
            () => DataHub.release(this._id),
            () => Events.release(this._id)
        ]
        for (const cleanup of cleanups) {
            try {
                cleanup()
            } catch (error) {
                console.warn('[NightVision] Cleanup failed:', error)
            }
        }
        activeChartIds.delete(this._id)
    }
}

export { NightVision }
