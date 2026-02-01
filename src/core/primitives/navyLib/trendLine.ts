
// Interactive trend line (line, ray or segment)
// Combining line primitive and pins

export default class TrendLine {
    core: any
    data: {
        type: string
        p1: number[]
        p2: number[]
        uuid: string
    }
    hover: boolean
    selected: boolean
    onSelect: (uuid: string) => void
    line: any
    pins: any[]

    constructor(core: any, line: any, nw: boolean = false) {
        this.core = core
        this.data = line
        this.hover = false
        this.selected = false
        this.onSelect = () => {}
        switch (line.type) {
            case 'segment':
                this.line = new core.lib.Segment(core)
            break
        }
        this.pins = [
            new core.lib.Pin(core, this, 'p1'),
            new core.lib.Pin(core, this, 'p2')
        ]
        if (nw) this.pins[1].state = 'tracking'
    }

    draw(ctx: CanvasRenderingContext2D) {

        this.line.update(this.data.p1, this.data.p2)
        ctx.lineWidth = 1
        ctx.strokeStyle = '#33ff33'
        ctx.beginPath()
        this.line.draw(ctx)
        ctx.stroke()

        if (this.hover || this.selected) {
            for (var pin of this.pins) {
                pin.draw(ctx)
            }
        }
    }

    collision() {
        const mouse = this.core.mouse
        let [x, y] = [mouse.x, mouse.y]
        return this.line.collision(x, y)
    }

    propagate(name: string, data: any) {
        for (var pin of this.pins) {
            pin[name](data)
        }
    } 

    mousedown(event: MouseEvent) {
        this.propagate('mousedown', event)
        if (this.collision()) {
            this.onSelect(this.data.uuid)
        }
    }

    mouseup(event: MouseEvent) {
        this.propagate('mouseup', event)
    }

    mousemove(event: MouseEvent) {
        this.hover = this.collision()
        this.propagate('mousemove', event)
    }
}
