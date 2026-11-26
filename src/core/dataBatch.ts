import type { Data, Overlay, Pane } from './dataHub'
import type { DataScanner } from './dataScanner'
import { copyCandle, copySeries, type Candle } from './candleData'
import { copyIndicator, copyOverlay, copyOverlayPoint, copyPane, findTarget, validateOverlayData,
    type DataTarget, type IndicatorInput, type IndicatorPatch, type OverlayInput,
    type OverlayPatch, type OverlayRow, type PaneInput, type PanePatch } from './paneData'
import Utils from '../stuff/utils'

/** Synchronous edits to a private draft. The enclosing chart.batch() applies the result. */
export type ChartBatch = Pick<DataBatch,
    'setSeries' | 'prependSeries' | 'updateCandle' | 'addPane' | 'updatePane' | 'removePane' |
    'addOverlay' | 'updateOverlay' | 'removeOverlay' | 'updateOverlayPoint' |
    'addIndicator' | 'updateIndicator' | 'removeIndicator'>

export default class DataBatch {
    readonly data: Data
    changed = false
    full = false
    sourceChanged = false
    prepended = 0
    private active = true
    private copiedRows = new WeakSet<any[]>()
    private initialMain: Overlay | undefined

    constructor(data: Data, private validateIndicator: (type: string | undefined) => void, scan: DataScanner) {
        this.data = { ...data, panes: (data.panes || []).map(pane => ({
            ...pane,
            settings: { ...pane.settings },
            overlays: (pane.overlays || []).map(overlay => {
                const copy = { ...overlay, settings: { ...overlay.settings }, props: { ...overlay.props } }
                scan.copyInferredIndexOffset(overlay, copy)
                return copy
            }),
            scripts: (pane.scripts || []).map(script => ({
                ...script, settings: { ...script.settings }, props: { ...script.props }
            }))
        })) }
        this.initialMain = this.main()
    }

    close(): void { this.active = false }

    setSeries(rows: readonly Candle[]): void {
        this.assertActive()
        const copy = copySeries(rows)
        this.candles().data = copy
        this.prepended = 0
        this.sourceChanged = this.full = this.changed = true
    }

    prependSeries(rows: readonly Candle[]): number {
        this.assertActive()
        const copy = copySeries(rows)
        if (!copy.length) return 0
        const overlay = this.candles()
        const first = overlay.data?.[0]?.[0] ?? Infinity
        let added = 0
        while (added < copy.length && copy[added][0] < first) added++
        if (!added) return 0
        const data = this.mutableRows(overlay)
        const length = data.length
        data.length += added
        for (let i = length - 1; i >= 0; i--) data[i + added] = data[i]
        for (let i = 0; i < added; i++) data[i] = copy[i]
        if (length) this.prepended += added
        this.full = this.changed = true
        return added
    }

    updateCandle(row: Candle): void {
        this.assertActive()
        const copy = copyCandle(row)
        this.updatePoint(this.candles(), copy)
        this.full = true
    }

    addPane(input: PaneInput = {}): string {
        this.assertActive()
        const pane = copyPane(input)
        pane.uuid = Utils.uuid3()
        pane.overlays ||= []
        pane.settings ||= {}
        pane.scripts = []
        for (const overlay of pane.overlays || []) overlay.uuid = Utils.uuid3()
        this.data.panes!.push(pane)
        const main = pane.overlays?.find(overlay => overlay.main)
        if (main) this.selectMain(main)
        this.full = this.changed = true
        return pane.uuid
    }

    updatePane(target: DataTarget, patch: PanePatch): void {
        const next = copyPane(patch, true)
        const pane = this.pane(target)
        pane.settings = { ...pane.settings, ...next.settings }
        this.changed = true
        if (Object.keys(next.settings || {}).some(key =>
            !['height', 'logScale', 'scales', 'scaleIndex', 'scaleTemplate', 'scaleSideIdxs'].includes(key))) this.full = true
    }

    removePane(target: DataTarget): void {
        const pane = this.pane(target)
        this.data.panes!.splice(this.data.panes!.indexOf(pane), 1)
        this.full = this.changed = true
    }

    addOverlay(paneTarget: DataTarget, input: OverlayInput): string {
        const overlay = copyOverlay(input, true)
        const pane = this.pane(paneTarget)
        overlay.uuid = Utils.uuid3()
        pane.overlays!.push(overlay)
        if (overlay.main) this.selectMain(overlay)
        this.full = this.changed = true
        return overlay.uuid
    }

    updateOverlay(paneTarget: DataTarget, target: DataTarget, patch: OverlayPatch): void {
        const next = copyOverlay(patch)
        const overlay = this.overlay(paneTarget, target)
        if (next.type !== undefined || next.data !== undefined) {
            validateOverlayData(next.type ?? overlay.type, next.data ?? overlay.data ?? [])
        }
        if (next.main) this.selectMain(overlay)
        Object.assign(overlay, next, {
            settings: { ...overlay.settings, ...next.settings }, props: { ...overlay.props, ...next.props }
        })
        this.changed = true
        if (next.type !== undefined || next.data !== undefined || next.main !== undefined ||
            Object.keys(next.settings || {}).some(key =>
                !['display', 'zIndex', 'scale', 'precision', 'showLegend', 'legendHtml'].includes(key))) this.full = true
    }

    removeOverlay(paneTarget: DataTarget, target: DataTarget): void {
        const overlay = this.overlay(paneTarget, target)
        const pane = this.pane(paneTarget)
        pane.overlays!.splice(pane.overlays!.indexOf(overlay), 1)
        this.full = this.changed = true
    }

    updateOverlayPoint(paneTarget: DataTarget, target: DataTarget, row: OverlayRow): void {
        const point = copyOverlayPoint(row)
        const overlay = this.overlay(paneTarget, target)
        validateOverlayData(overlay.type, [point])
        this.updatePoint(overlay, point)
        if (overlay === this.main()) this.full = true
    }

    addIndicator(paneTarget: DataTarget, input: IndicatorInput): string {
        const indicator = copyIndicator(input, true)
        const pane = this.pane(paneTarget)
        this.validateIndicator(indicator.type)
        indicator.uuid = Utils.uuid3()
        pane.scripts!.push(indicator)
        this.full = this.changed = true
        return indicator.uuid
    }

    updateIndicator(paneTarget: DataTarget, target: DataTarget, patch: IndicatorPatch): void {
        const next = copyIndicator(patch)
        const indicator = findTarget(this.pane(paneTarget).scripts!, target, 'Indicator')
        this.validateIndicator(next.type ?? indicator.type)
        Object.assign(indicator, next, {
            settings: { ...indicator.settings, ...next.settings }, props: { ...indicator.props, ...next.props }
        })
        this.full = this.changed = true
    }

    removeIndicator(paneTarget: DataTarget, target: DataTarget): void {
        const pane = this.pane(paneTarget)
        const indicator = findTarget(pane.scripts!, target, 'Indicator')
        pane.scripts!.splice(pane.scripts!.indexOf(indicator), 1)
        for (const current of this.data.panes!) {
            current.overlays = current.overlays!.filter(overlay => !indicator.uuid || overlay.prod !== indicator.uuid)
        }
        this.full = this.changed = true
    }

    normalizeMain(): void {
        const authored = this.data.panes!.flatMap(pane => pane.overlays || []).filter(overlay => !overlay.prod)
        const main = authored.find(overlay => overlay.main) || authored[0]
        if (main !== this.initialMain) {
            this.prepended = 0
            this.sourceChanged = true
        }
        if (main) {
            for (const overlay of this.data.panes!.flatMap(pane => pane.overlays || [])) overlay.main = overlay === main
        } else {
            for (const pane of this.data.panes!) pane.overlays = []
        }
    }

    private assertActive(): void {
        if (!this.active) throw new DOMException('Batch is no longer active', 'AbortError')
    }

    private pane(target: DataTarget): Pane {
        this.assertActive()
        return findTarget(this.data.panes!, target, 'Pane')
    }

    private overlay(paneTarget: DataTarget, target: DataTarget): Overlay {
        const overlay = findTarget(this.pane(paneTarget).overlays!, target, 'Overlay')
        if (overlay.prod) throw new TypeError('Script-produced overlays must be managed through their indicator scripts')
        return overlay
    }

    private main(): Overlay | undefined {
        const overlays = this.data.panes!.flatMap(pane => pane.overlays || []).filter(overlay => !overlay.prod)
        return overlays.find(overlay => overlay.main) || overlays[0]
    }

    private selectMain(main: Overlay): void {
        for (const overlay of this.data.panes!.flatMap(pane => pane.overlays || [])) overlay.main = overlay === main
        this.prepended = 0
        this.sourceChanged = true
    }

    private candles(): Overlay {
        let main = this.main()
        if (!main) {
            if (!this.data.panes!.length) this.addPane()
            main = { type: 'Candles', main: true, data: [], uuid: Utils.uuid3() }
            this.data.panes![0].overlays!.unshift(main)
        }
        if (main.type !== 'Candles' && main.type !== 'CandlesPlus') {
            throw new TypeError('The main overlay must use Candles or CandlesPlus')
        }
        return main
    }

    private mutableRows(overlay: Overlay): any[] {
        const rows = overlay.data || (overlay.data = [])
        if (this.copiedRows.has(rows)) return rows
        const copy = rows.slice()
        for (const current of this.data.panes!.flatMap(pane => pane.overlays || [])) {
            if (current.data === rows) current.data = copy
        }
        this.copiedRows.add(copy)
        return copy
    }

    private updatePoint(overlay: Overlay, point: unknown[]): void {
        const last = overlay.data?.at(-1)
        if (last && (point[0] as number) < last[0]) throw new RangeError('Cannot update an older point')
        const rows = this.mutableRows(overlay)
        if (last && point[0] === last[0]) rows[rows.length - 1] = point
        else rows.push(point)
        this.changed = true
    }
}
