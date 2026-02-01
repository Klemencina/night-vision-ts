
// Inline shader object, can be used
// to draw stuff on Sidebar, Botbar or Grid

export default class Shader {
    target: string // Where to apply ('sidebar|botbar|grid')
    draw: (ctx: CanvasRenderingContext2D) => void // arrow function ctx => {}
    name?: string // optional
    id: string | null // Generated automatically
    zIndex: number

    constructor(
        target: string,
        draw: (ctx: CanvasRenderingContext2D) => void,
        name?: string
    ) {
        this.target = target
        this.draw = draw
        this.name = name
        this.id = null
        this.zIndex = 0
    }
}
