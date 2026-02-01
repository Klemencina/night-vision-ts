
// Crosshair layer. Extends Layer class,
// TODO: can be replaced by overlay script
// TODO: generalize show/hide to any layer

import Layer from '../layer'
import Const from '../../stuff/constants'
import Events from '../events'

const HPX = Const.HPX

export default class Crosshair extends Layer {
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

        this.events = Events.instance(this.nvId)
        this.events.on(`crosshair:show-crosshair`, this.onShowHide.bind(this) as any)
        
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

        if (!cursor.visible || !this.show) return

        //if (!this.visible && cursor.mode === 'explore') return

        ctx.save()
        ctx.strokeStyle = this.props!.colors.cross
        ctx.beginPath()
        ctx.setLineDash([5])

        // H
        if (cursor.gridId === this.layout.id) {
            ctx.moveTo(0, cursor.y + HPX)
            ctx.lineTo(this.layout.width + HPX, cursor.y + HPX)
        }

        // V
        ctx.moveTo(cursor.x, 0)
        ctx.lineTo(cursor.x, this.layout.height)
        ctx.stroke()
        ctx.restore()
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
        this.events.off('crosshair')
    }
}
