
// Fast volume bar

import Const from '../../../stuff/constants'

const HPX = Const.HPX

export default function volumeBar(
    ctx: CanvasRenderingContext2D,
    data: {
        x1: number
        x2: number
        h: number
    },
    layout: { height: number }
): void {
    let y0 = layout.height
    let w = Math.max(1, data.x2 - data.x1 + HPX)
    let h = data.h
    let x05 = (data.x2 + data.x1) * 0.5

    ctx.lineWidth = w

    ctx.moveTo(x05, y0 - h)
    ctx.lineTo(x05, y0)
}
