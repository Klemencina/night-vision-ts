
// Mouse event handler for overlay

type MouseHandler = (event: MouseEvent) => void

interface Component {
    $props: {
        cursor: {
            x: number
            y: number
            ti: number
            y$: number
        }
    }
    layout: {
        screen2t(x: number): number
        screen2$(y: number): number
    }
}

export default class Mouse {

    private comp: Component
    private map: { [name: string]: MouseHandler[] }
    private listeners: number
    pressed: boolean
    x: number
    y: number
    t: number
    y$: number

    constructor(comp: Component) {
        this.comp = comp
        this.map = {}
        this.listeners = 0
        this.pressed = false
        this.x = comp.$props.cursor.x
        this.y = comp.$props.cursor.y
        this.t = comp.$props.cursor.ti
        this.y$ = comp.$props.cursor.y$
    }

    // You can choose where to place the handler
    // (beginning or end of the queue)
    on(name: string, handler: MouseHandler, dir: "unshift" | "push" = "unshift"): void {
        if (!handler) return
        this.map[name] = this.map[name] || []
        this.map[name][dir](handler)
        this.listeners++
    }

    off(name: string, handler: MouseHandler): void {
        if (!this.map[name]) return
        let i = this.map[name].indexOf(handler)
        if (i < 0) return
        this.map[name].splice(i, 1)
        this.listeners--
    }

    // Called by grid.js
    emit(name: string, event: MouseEvent): void {
        const l = this.comp.layout
        if (name in this.map) {
            for (const f of this.map[name]) {
                f(event)
            }
        }
        if (name === 'mousemove') {
            this.x = event.layerX
            this.y = event.layerY
            this.t = l.screen2t(this.x)
            this.y$ = l.screen2$(this.y)
        }
        if (name === 'mousedown') {
            this.pressed = true
        }
        if (name === 'mouseup') {
            this.pressed = false
        }
    }

}
