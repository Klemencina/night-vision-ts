// Container for y-transforms, meta functions, other info
// about overlays (e.g. yRange)

import Events from './events'
import DataHub from './dataHub'

interface YRangeFn {
    exec: (data: any[], h: number, l: number) => [number, number, boolean?] | null
    preCalc?: boolean
}

interface LegendFn {
    legend?: (values: any[]) => any[]
    legendHtml?: (values: any[]) => string
    noLegend?: boolean
}

interface ValueTracker {
    show?: boolean
    value?: () => number
    color?: () => string
}

interface OhlcMapEntry {
    ref: any[]
    index: number
}

interface YTransformEvent {
    gridId: number
    scaleId: string
    auto?: boolean
    range?: [number, number]
    updateLayout?: boolean
}

interface OverlaySelectEvent {
    index: [number, number]
}

interface Props {
    // Props placeholder
}

interface Overlay {
    gridId: () => number
    id: () => number
    yRange?: (data: any[], h: number, l: number) => [number, number, boolean?] | null
    yRangePreCalc?: boolean
    preSampler?: (dataPoint: any[]) => number | number[]
    legend?: (values: any[]) => any[]
    legendHtml?: (values: any[]) => string
    noLegend?: boolean
    valueTracker?: ValueTracker
    ohlc?: (ref: any[]) => [number, number, number, number]
}

class MetaHub {
    hub: any
    events: any
    storage: Record<string, any>
    panes: number = 0
    ready: boolean = false
    legendFns: LegendFn[][] = []
    yTransforms: Record<string, any>[][] = []
    preSamplers: (((dataPoint: any[]) => number | number[]) | undefined)[][] = []
    yRangeFns: (YRangeFn | null)[][] = []
    autoPrecisions: (number | undefined)[][] = []
    valueTrackers: (ValueTracker | undefined)[][] = []
    selectedOverlay: [number, number] | undefined = undefined
    ohlcMap: Record<number, OhlcMapEntry> = {}
    ohlcFn: ((ref: any[]) => [number, number, number, number]) | undefined = undefined
    scrollLock: boolean = false

    constructor(nvId: string) {
        let events = Events.instance(nvId)
        this.hub = DataHub.instance(nvId)
        this.events = events

        // EVENT INTERFACE
        events.on('meta:sidebar-transform', this.onYTransform.bind(this) as any)
        events.on('meta:select-overlay', this.onOverlaySelect.bind(this) as any)
        events.on('meta:grid-mousedown', this.onGridMousedown.bind(this) as any)
        events.on('meta:scroll-lock', this.onScrollLock.bind(this) as any)

        // Persistent meta storage
        this.storage = {}
    }

    init(props: Props): void {
        this.panes = 0 // Panes processed
        this.ready = false
        // [API] read-only
        this.legendFns = [] // Legend formatters
        this.yTransforms = [] // yTransforms of sidebars
        this.preSamplers = [] // Auto-precision samplers
        this.yRangeFns = [] // yRange functions of overlays
        this.autoPrecisions = [] // Auto-precision for overlays
        this.valueTrackers = [] // Price labels + price lines
        // TODO: legend formatters ...
        // TODO: last values
        this.selectedOverlay = undefined
        /* OHLC Map format: {
            timestamp: {
                ref: [], // Reference to n-th data item
                index: n // Item global index
            }, ...
        }*/
        this.ohlcMap = {} // time => OHLC map of the main ov
        this.ohlcFn = undefined // OHLC mapper function
        this.scrollLock = false // Scroll lock state
    }

    // Extract meta functions from overlay
    exctractFrom(overlay: Overlay): void {
        let gridId = overlay.gridId()
        let id = overlay.id()

        // yRange functions
        var yrfs = this.yRangeFns[gridId] || []
        yrfs[id] = overlay.yRange
            ? {
                  exec: overlay.yRange,
                  preCalc: overlay.yRangePreCalc
              }
            : null

        // Precision samplers
        var aps = this.preSamplers[gridId] || []
        aps[id] = overlay.preSampler

        // Legend formatters
        var lfs = this.legendFns[gridId] || []
        lfs[id] = {
            legend: overlay.legend,
            legendHtml: overlay.legendHtml,
            noLegend: overlay.noLegend ?? false
        }

        // Value trackers
        var vts = this.valueTrackers[gridId] || []
        vts[id] = overlay.valueTracker

        // Ohlc mapper function
        let main = this.hub.overlay(gridId, id).main
        if (main) {
            this.ohlcFn = overlay.ohlc
        }

        this.yRangeFns[gridId] = yrfs
        this.preSamplers[gridId] = aps
        this.legendFns[gridId] = lfs
        this.valueTrackers[gridId] = vts
    }

    // Maps timestamp => ohlc, index
    // TODO: should add support for indexBased?
    calcOhlcMap(): void {
        this.ohlcMap = {}
        let data = this.hub.mainOv.data
        for (var i = 0; i < data.length; i++) {
            this.ohlcMap[data[i][0]] = {
                ref: data[i],
                index: i
            }
        }
    }

    // Store auto precision for a specific overlay
    setAutoPrec(gridId: number, ovId: number, prec: number): void {
        let aps = this.autoPrecisions[gridId] || []
        aps[ovId] = prec
        this.autoPrecisions[gridId] = aps
    }

    // Call this after all overlays are processed
    // We need to make an update to apply freshly
    // extracted functions
    // TODO: probably can do better
    finish(): void {
        this.panes++
        if (this.panes < this.hub.panes().length) return
        this.autoPrecisions = [] // wait for preSamplers
        //this.restore()
        this.calcOhlcMap()
        this.ready = true
        setTimeout(() => {
            this.events.emitSpec('chart', 'update-layout')
            this.events.emit('update-legend')
        })
    }

    // Store some meta info such as ytransform by
    // (pane.uuid + scaleId) hash
    store(): void {
        this.storage = {}
        let yts = this.yTransforms || []
        for (var paneId in yts) {
            let paneYts = yts[paneId]
            let pane = this.hub.panes()[paneId]
            if (!pane) continue
            for (var scaleId in paneYts) {
                let hash = `yts:${pane.uuid}:${scaleId}`
                this.storage[hash] = paneYts[scaleId]
            }
        }
    }

    // Restore that info after an update in the
    // pane/overlay order
    restore(): void {
        let yts = this.yTransforms
        for (var hash in this.storage) {
            let [type, uuid1, uuid2] = hash.split(':')
            let pane = this.hub.panes().find((x: any) => x.uuid === uuid1)
            if (!pane) continue
            switch (type) {
                case 'yts': // Y-transforms
                    if (!yts[pane.id]) yts[pane.id] = []
                    yts[pane.id][uuid2 as any] = this.storage[hash]
                    break
            }
        }
        this.store() // Store new state
    }

    // [API] Get y-transform of a specific scale
    getYtransform(gridId: number, scaleId: string): any {
        return (this.yTransforms[gridId] || [])[scaleId as any]
    }

    // [API] Get auto precision of a specific overlay
    getAutoPrec(gridId: number, ovId: number): number | undefined {
        return (this.autoPrecisions[gridId] || [])[ovId]
    }

    // [API] Get a precision smapler of a specific overlay
    getPreSampler(
        gridId: number,
        ovId: number
    ): ((dataPoint: any[]) => number | number[]) | undefined {
        const grid = (this.preSamplers || [])[gridId]
        return grid ? grid[ovId] : undefined
    }

    // [API] Get legend formatter of a specific overlay
    getLegendFns(gridId: number, ovId: number): LegendFn | undefined {
        return (this.legendFns[gridId] || [])[ovId]
    }

    // [API] Get OHLC values to use as "magnet" values
    ohlc(t: number): [number, number, number, number] | undefined {
        let el = this.ohlcMap[t]
        if (!el || !this.ohlcFn) return
        return this.ohlcFn(el.ref)
    }

    // EVENT HANDLERS

    // User changed y-range
    onYTransform(event: YTransformEvent): void {
        let yts = this.yTransforms[event.gridId] || {}
        let tx = (yts as any)[event.scaleId] || {}
        ;(yts as any)[event.scaleId] = Object.assign(tx, event)
        this.yTransforms[event.gridId] = yts as any
        if (event.updateLayout) {
            this.events.emitSpec('chart', 'update-layout')
        }
        this.store()
    }

    // User tapped legend & selected the overlay
    onOverlaySelect(event: OverlaySelectEvent): void {
        this.selectedOverlay = event.index
        this.events.emit('$overlay-select', {
            index: event.index,
            ov: this.hub.overlay(...event.index)
        })
    }

    // User tapped grid (& deselected all overlays)
    onGridMousedown(event: any): void {
        this.selectedOverlay = undefined
        this.events.emit('$overlay-select', {
            index: undefined,
            ov: undefined
        })
    }

    // Overlay/user set lock on scrolling
    onScrollLock(event: boolean): void {
        this.scrollLock = event
    }
}

let instances: Record<string, MetaHub> = {}

function instance(id: string): MetaHub {
    if (!instances[id]) {
        instances[id] = new MetaHub(id)
    }
    return instances[id]
}

export { MetaHub, instance }
export default { instance }
