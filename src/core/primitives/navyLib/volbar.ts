
// Old implementation of volume bar

import Const from '../../../stuff/constants'

const HPX = Const.HPX

interface VolbarData {
    x1: number
    x2: number
    h: number
    green: boolean
    src: any[]
}

interface VolbarStyle {
    colorVolUp: string
    colorVolDw: string
}

export default class Volbar {
    ctx: CanvasRenderingContext2D
    style: VolbarStyle
    layout: { height: number }

    constructor(core: any, props: VolbarStyle, ctx: CanvasRenderingContext2D, data: { src: any[] }) {
        this.ctx = ctx
        this.style = data.src[6] || props
        this.layout = core.layout
        this.draw(data as any)
    }

    draw(data: VolbarData) {
        let y0 = this.layout.height
        let w = data.x2 - data.x1
        let h = Math.floor(data.h)

        this.ctx.fillStyle = data.green ?
            this.style.colorVolUp :
            this.style.colorVolDw

        this.ctx.fillRect(
            Math.floor(data.x1),
            Math.floor(y0 - h + HPX),
            Math.floor(w),
            Math.floor(h + 1)
        )

    }

}
