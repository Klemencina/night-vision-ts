
// Draws a segment, adds corresponding collision f-n

import Math2 from '../../../stuff/math'

export default class Segment {
    T: number
    core: any
    x1: number = 0
    y1: number = 0
    x2: number = 0
    y2: number = 0

    // Overlay ref, canvas ctx
    constructor(core: any) {
        this.T = core.props.config.TOOL_COLL
        this.core = core
    }

    // Update line coordinates
    update(p1: number[], p2: number[]) {

        const layout = this.core.layout

        this.x1 = layout.time2x(p1[0])
        this.y1 = layout.value2y(p1[1])
        this.x2 = layout.time2x(p2[0])
        this.y2 = layout.value2y(p2[1])
    }

    // p1[t, $], p2[t, $] (time-price coordinates)
    // TODO: fix for index-based
    draw(ctx: CanvasRenderingContext2D) {
        ctx.moveTo(this.x1, this.y1)
        ctx.lineTo(this.x2, this.y2)
    }

    // Collision function. x, y - mouse coord.
    collision(x: number, y: number) {
        return Math2.point2seg(
            [x, y], 
            [this.x1, this.y1], 
            [this.x2, this.y2]
        ) < this.T
    }
}
