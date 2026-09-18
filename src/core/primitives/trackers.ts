
// Scale value trackers (scale labels, price lines)

import Layer from '../layer'
import DataHub from '../dataHub'
import MetaHub from '../metaHub'
import sidebar from './sidebar'
import { priceLine } from './priceLine'

interface Tracker {
    color: string
    line?: boolean
    y: number
    value: number
    show?: boolean
    ovId: number
}

export default class Trackers extends Layer {
    zIndex: number
    ctxType: string
    hub: ReturnType<typeof DataHub.instance>
    meta: ReturnType<typeof MetaHub.instance>
    trackerId: string
    props: any
    gridId: string
    overlay: {
        draw: (ctx: CanvasRenderingContext2D) => void
        destroy: () => void
        drawSidebar: (ctx: CanvasRenderingContext2D, side: string, scale: any) => void
    }
    env: {
        update: (ovSrc: any, layout: any, props: any) => void
        destroy: () => void
    }
    layout?: any
    trackers: Tracker[]
    scaleId?: string

    constructor(id: string, props: any, gridId: string) {
        super(id as any, '__$Trackers__', props.id)

        this.trackerId = id
        this.gridId = gridId
        this.zIndex = 500000
        this.ctxType = 'Canvas'
        this.hub = DataHub.instance(props.id)
        this.meta = MetaHub.instance(props.id)
        this.props = props

        this.overlay = {
            draw: this.draw.bind(this),
            destroy: this.destroy.bind(this),
            drawSidebar: this.drawSidebar.bind(this)
        }

        this.env = {
            update: this.envEpdate.bind(this),
            destroy: () => {}
        }

        this.trackers = []
    }

    draw(ctx: CanvasRenderingContext2D) {

        if (!this.layout) return

        // TODO: how to draw price line on non-main Scale?
        let gridIdNum = parseInt(this.gridId)
        let trackers = this.meta.valueTrackers[gridIdNum] || []
        this.trackers = []

        for (var i = 0; i < trackers.length; i++) {
            let vt = trackers[i]
            if (!vt) continue
            const source = this.hub.overlay(gridIdNum, i)
            if (!source || source.settings?.display === false) continue
            let data = this.hub.ovData(gridIdNum, i) || []
            let last = data[data.length - 1] || []
            const valueTracker = vt(last)
            if (!valueTracker?.show || !Number.isFinite(valueTracker.value)) continue
            const tracker: Tracker = Object.assign(valueTracker, {
                ovId: i,
                y: this.layout.value2y(valueTracker.value),
                color: valueTracker.color || this.props.colors.scale
            })
            if (!Number.isFinite(tracker.y)) continue
            if (tracker.line){
                priceLine(this.layout, ctx, tracker)
            }

            // Save from repeating the loop
            this.trackers.push(tracker)
        }

    }

    drawSidebar(ctx: CanvasRenderingContext2D, side: string, scale: any) {

        if (!this.layout) return

        for (var tracker of this.trackers || []) {
            if (!this.trackerIsVisible(tracker, scale)) continue
            ;(sidebar as any).tracker(
                this.props, this.layout, scale, side, ctx, tracker
            )
        }

    }

    hasVisibleCountdown(side: 'left' | 'right', scale: any): boolean {
        if (!this.layout || !this.display) return false
        return this.trackers.some(tracker =>
            this.trackerIsVisible(tracker, scale) &&
            sidebar.hasVisibleCountdown(this.props, this.layout, side, tracker)
        )
    }

    private trackerIsVisible(tracker: Tracker, scale: any): boolean {
        const source = this.hub.overlay(parseInt(this.gridId), tracker.ovId)
        return !!source && source.settings?.display !== false &&
            this.getScaleId(tracker.ovId) === scale.scaleSpecs.id
    }

    envEpdate(ovSrc: any, layout: any, props: any) {
        this.ovSrc = ovSrc
        this.layout = layout
        this.props = props

        this.scaleId = this.getScaleId()
    }

    // Get the scale id of this overlay
    // TODO: more efficient method of getting ov scale
    getScaleId(ovId?: number): string | undefined {
        let scales = this.layout!.scales
        for (var i in scales) {
            let ovIdxs = scales[i].scaleSpecs.ovIdxs
            if (ovIdxs.includes(ovId !== undefined ? ovId : this.scaleId)) {
                return i
            }
        }
        return undefined
    }

    destroy() {}
}
