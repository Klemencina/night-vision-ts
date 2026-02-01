
// Grid layer (actuall # grid). Extends Layer class,
// TODO: can be replaced by overlay script

import Layer from '../layer'
import Const from '../../stuff/constants'
import Events from '../events'

const HPX = Const.HPX

export default class Grid extends Layer {
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
    gridId: string
    layout?: any
    props?: any

    constructor(id: string, nvId: string) {
        super(id as any, '__$Grid__', nvId)

        this.events = Events.instance(this.nvId)
        this.events.on(`grid-layer:show-grid`, this.onShowHide.bind(this) as any)

        this.gridId = id
        this.zIndex = -1000000 // Deep down in the abyss
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

        let layout = this.layout
        if (!layout || !this.show) return

        ctx.strokeStyle = this.props!.colors.grid
        ctx.beginPath()

        const ymax = layout.height
        for (var [x] of layout.xs) {

            ctx.moveTo(x + HPX, 0)
            ctx.lineTo(x + HPX, ymax)

        }

        for (var [y] of layout.ys) {

            ctx.moveTo(0, y + HPX)
            ctx.lineTo(layout.width, y + HPX)

        }

        ctx.stroke()

    }

    envEpdate(ovSrc: any, layout: any, props: any) {
        this.ovSrc = ovSrc
        this.layout = layout
        this.props = props
    }

    onShowHide(flag: boolean) {
        this.show = flag
    }

    destroy() {
        this.events.off('grid-layer')
    }
}
