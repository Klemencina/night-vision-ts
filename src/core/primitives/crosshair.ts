
// Crosshair layer. Extends Layer class,
// TODO: can be replaced by overlay script
// TODO: generalize show/hide to any layer

import Layer from '../layer'
import Const from '../../stuff/constants'
import Utils from '../../stuff/utils'
import DataHub from '../dataHub'
import Events from '../events'

const HPX = Const.HPX
let nextEventId = 0

export default class Crosshair extends Layer {
    private eventId = `crosshair-${++nextEventId}`
    private readonly hub: ReturnType<typeof DataHub.instance>
    events: ReturnType<typeof Events.instance>
    zIndex: number
    ctxType: string
    show: boolean
    overlay: {
        draw: (ctx: CanvasRenderingContext2D) => void
        destroy: () => void
    }
    env: {
        update: (ovSrc: any, layout: any, props: any) => void
        destroy: () => void
    }
    crosshairId: string
    layout?: any
    props?: any

    constructor(id: string, nvId: string) {
        super(id as any, '__$Crosshair__', nvId)

        this.hub = DataHub.instance(nvId)
        this.events = Events.instance(this.nvId)
        this.events.on(`${this.eventId}:show-crosshair`, this.onShowHide.bind(this) as any)
        
        this.crosshairId = id
        this.zIndex = 1000000
        this.ctxType = 'Canvas'
        this.show = true

        this.overlay = {
            draw: this.draw.bind(this),
            destroy: this.destroy.bind(this)
        }

        this.env = {
            update: this.envEpdate.bind(this),
            destroy: () => {}
        }
    }

    draw(ctx: CanvasRenderingContext2D) {

        if (!this.layout) return

        const cursor = this.props!.cursor
        const localVisible = cursor.visible && this.show
        const peerX = this.peerX()

        if (!localVisible && peerX === null) return

        ctx.save()
        ctx.strokeStyle = this.props!.colors.cross
        ctx.beginPath()
        ctx.setLineDash([5])

        if (localVisible && cursor.gridId === this.layout.id) {
            ctx.moveTo(0, cursor.y + HPX)
            ctx.lineTo(this.layout.width + HPX, cursor.y + HPX)
        }

        if (localVisible) {
            ctx.moveTo(cursor.x, 0)
            ctx.lineTo(cursor.x, this.layout.height)
        }
        if (peerX !== null && (!localVisible || peerX !== cursor.x)) {
            ctx.moveTo(peerX, 0)
            ctx.lineTo(peerX, this.layout.height)
        }
        ctx.stroke()
        ctx.restore()
    }

    private peerX(): number | null {
        const timestampMs: number | null | undefined = this.props?.peerCrosshair?.timestampMs
        if (timestampMs == null) return null
        const main = this.hub.mainOv
        if (!main?.data?.length) return null
        const data = main.data
        if (timestampMs < data[0][0] || timestampMs > data[data.length - 1][0]) return null

        const ti = this.layout.indexBased
            ? Utils.nearestTs(timestampMs, data)[0] + (main.indexOffset ?? 0)
            : timestampMs
        const x = this.layout.time2x(ti)
        return x >= 0 && x < this.layout.width ? x : null
    }

    envEpdate(ovSrc: any, layout: any, props: any) {
        this.ovSrc = ovSrc
        this.layout = layout
        this.props = props
    }

    onCursor(update: any) {
        if (this.props) this.props.cursor = update
    }

    onShowHide(flag: boolean) {
        this.show = flag
    }

    destroy() {
        this.events.off(this.eventId)
    }
}
