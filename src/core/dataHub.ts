// Data container (original plus subset data)
// + Completes the structure to a full state
// + Implements various update operations.

import Utils from '../stuff/utils'
import Events, { EventHandler } from './events'
import SeClient, { SeClient as SeClientType } from './se/seClient'
import DataView$ from './dataView'

interface Overlay {
    id?: number
    main?: boolean
    data?: any[]
    dataView?: any
    dataSubset?: any[]
    dataExt?: Record<string, any>
    settings?: Record<string, any>
    props?: Record<string, any>
    uuid?: string
    type?: string
    indexOffset?: number
}

interface Script {
    id?: number
    settings?: Record<string, any>
    props?: Record<string, any>
    uuid?: string
}

interface Pane {
    id?: number
    overlays: Overlay[]
    scripts?: Script[]
    settings: Record<string, any>
    uuid?: string
}

interface Data {
    panes?: Pane[]
    indexBased?: boolean
}

interface ScaleIndexEvent {
    paneId: number
    index: string
    sideIdxs: string[]
}

interface DisplayOvEvent {
    paneId: number
    ovId: number
    flag: boolean
}

class DataHub {
    events: ReturnType<typeof Events.instance>
    se: SeClientType
    data!: Data
    indexBased!: boolean
    chart: Pane | null = null
    offchart: Pane[] | null = null
    mainOv: Overlay | null = null
    mainPaneId: number | null = null

    constructor(nvId: string) {
        let events = Events.instance(nvId)
        let se = SeClient.instance(nvId)
        this.events = events
        this.se = se
        se.hub = this // Set a ref to the hub

        // EVENT INTERFACE
        events.on('hub:set-scale-index', this.onScaleIndex.bind(this) as EventHandler)
        events.on('hub:display-overlay', this.onDisplayOv.bind(this) as EventHandler)
    }

    init(data: Data): void {
        // [API] All here are read-only

        // Data object
        this.data = data
        // Index based mode
        this.indexBased = data.indexBased ?? false

        this.chart = null // Pane with the main overlay (main pane)
        this.offchart = null // All other panes
        this.mainOv = null // Main overlay ref
        this.mainPaneId = null // Mane pane id

        // Ensure all panes (including script-only panes) have uuid/overlays/settings
        // so panes() and worker execScripts include them before calcSubset runs
        for (var pane of this.data.panes || []) {
            pane.overlays = pane.overlays || []
            pane.settings = pane.settings || {}
            pane.uuid = pane.uuid || Utils.uuid3()
            pane.scripts = pane.scripts || []
        }
    }

    // Update data on 'range-changed'. Should apply
    // filters only (not updating the full structure)
    updateRange(range: [number, number]): void {
        for (var pane of this.data.panes || []) {
            for (var ov of pane.overlays) {
                let off = ov.indexOffset
                ov.dataView = this.filter(ov.data!, range, off)
                ov.dataSubset = ov.dataView.makeSubset()
            }
        }
    }

    // Calculate visible data section
    // (& completes the main structure)
    // TODO: smarter algo of adding/removing panes. Uuids
    // should remain the same if pane still exists
    calcSubset(range: [number, number]): void {
        var paneId = 0
        for (var pane of this.data.panes || []) {
            pane.id = paneId++
            pane.overlays = pane.overlays || []
            pane.settings = pane.settings || {}
            var ovId = 0
            for (var ov of pane.overlays) {
                ov.id = ovId++
                ov.main = !!ov.main
                ov.data = ov.data || []
                ov.dataView = this.filter(ov.data, range, ov.indexOffset)
                ov.dataSubset = ov.dataView.makeSubset()
                ov.dataExt = ov.dataExt || {}
                ov.settings = ov.settings || {}
                ov.props = ov.props || {}
                ov.uuid = ov.uuid || Utils.uuid3()
            }
            // Flag that pane is ready for rendering
            pane.uuid = pane.uuid || Utils.uuid3()
        }
    }

    // Load indicator scripts
    async loadScripts(exec: boolean = false): Promise<void> {
        for (var pane of this.data.panes || []) {
            var scriptId = 0
            pane.scripts = pane.scripts || []
            for (var s of pane.scripts) {
                s.id = scriptId++
                s.settings = s.settings || {}
                s.props = s.props || {}
                s.uuid = s.uuid || Utils.uuid3()
            }
        }
        if (exec) {
            await Utils.pause(0) // Wait for init
            await this.se.uploadAndExec()
        }
    }

    // Detect the main chart, define offcharts
    detectMain(): void {
        // TODO: remove duplicate code here & in dataScanner
        let all: any[] = Utils.allOverlays(this.data.panes as any)
        let mainOv = all.find((x: any) => x.main) || all[0]

        if (!all.length || !mainOv) return

        mainOv.main = true // If there is only one OV

        this.chart =
            (this.data.panes || []).find((x: Pane) => x.overlays.find((y: Overlay) => y.main)) ||
            null

        this.offchart = (this.data.panes || []).filter((x: Pane) => x !== this.chart)

        this.mainOv = mainOv
        this.mainPaneId = this.chart ? this.panes().indexOf(this.chart) : null

        // Remove all 'main' overlays except the first
        for (var ov of all) {
            if (ov !== mainOv) ov.main = false
        }
    }

    // [API] Create a subset of timeseries
    filter(data: any[], range: [number, number], offset: number = 0): any {
        let filter = this.indexBased ? Utils.fastFilterIB : Utils.fastFilter2
        var ix = filter(data, range[0] - offset, range[1] - offset)
        return new DataView$(data, ix[0]!, ix[1]!)
    }

    // [API] Get all active panes (with uuid)
    panes(): Pane[] {
        return (this.data.panes || []).filter((x: Pane) => x.uuid)
    }

    // [API] Get overlay ref by paneId & ovId
    overlay(paneId: number, ovId: number): Overlay | undefined {
        return this.panes()[paneId]?.overlays[ovId]
    }

    // [API] Get overlay data by paneId & ovId
    ovData(paneId: number, ovId: number): any[] | undefined {
        return this.panes()[paneId]?.overlays[ovId]?.data
    }

    // [API] Get overlay extra data by paneId & ovId
    ovDataExt(paneId: number, ovId: number): Record<string, any> | undefined {
        return this.panes()[paneId]?.overlays[ovId]?.dataExt
    }

    // [API] Get overlay data subset by paneId & ovId
    ovDataSubset(paneId: number, ovId: number): any[] | undefined {
        return this.panes()[paneId]?.overlays[ovId]?.dataSubset
    }

    // [API] Get All overlays
    allOverlays(type?: string): Overlay[] {
        let all: any[] = Utils.allOverlays(this.data.panes as any)
        return type ? all.filter((x: any) => x.type === type) : all
    }

    // Event handlers

    onScaleIndex(event: ScaleIndexEvent): void {
        let pane = this.panes()[event.paneId]
        if (!pane) return

        // Main scale index (that used for the grid)
        pane.settings.scaleIndex = event.index

        // Local left & right indices used to
        // display the correct Scale
        pane.settings.scaleSideIdxs = event.sideIdxs

        this.events.emitSpec('chart', 'update-layout')
    }

    onDisplayOv(event: DisplayOvEvent): void {
        let pane = this.panes()[event.paneId]
        if (!pane) return

        let ov = pane.overlays[event.ovId]
        if (!ov) return

        ov.settings!.display = event.flag

        // Legend-line id
        let llId = `${event.paneId}-${event.ovId}`

        this.events.emitSpec('chart', 'update-layout')
        this.events.emitSpec(`ll-${llId}`, 'update-ll')
    }
}

let instances: Record<string, DataHub> = {}

function instance(id: string): DataHub {
    if (!instances[id]) {
        instances[id] = new DataHub(id)
    }
    return instances[id]
}

export type { Overlay, Script, Pane, Data }
export { DataHub, instance }
export default { instance }
