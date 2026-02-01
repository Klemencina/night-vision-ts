// Tracking the state of mouse (easy access)

type MouseHandler = (event: MouseEvent | any) => void

interface Layout {
    y2value: (y: number) => number
    x2time: (x: number) => number
}

interface Cursor {
    x?: number
    y?: number
    t?: number
}

interface Core {
    layout: Layout
    cursor: Cursor
}

export default class Mouse {
    core: Core
    map: Record<string, MouseHandler[]>
    listeners: number
    pressed: boolean
    x?: number
    y?: number
    t?: number
    y$: number

    constructor(core: Core) {
        const l = core.layout
        this.core = core
        this.map = {}
        this.listeners = 0
        this.pressed = false
        this.x = core.cursor.x
        this.y = core.cursor.y
        this.t = core.cursor.t
        this.y$ = l.y2value(core.cursor.y ?? 0)
    }

    // You can choose where to place the handler
    // (beginning or end of the queue)
    on(name: string, handler: MouseHandler | undefined, dir: "unshift" | "push" = "unshift"): void {
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

    // Called by Grid.svelte
    emit(name: string, event: MouseEvent | any): void {
        const l = this.core.layout
        if (name in this.map) {
            for (var f of this.map[name]) {
                f(event)
            }
        }
        if (name === 'mousemove') {
            this.x = event.layerX
            this.y = event.layerY
            this.t = l.x2time(this.x!)
            this.y$ = l.y2value(this.y!)
        }
        if (name === 'mousedown') {
            this.pressed = true
        }
        if (name === 'mouseup') {
            this.pressed = false
        }
    }

}
