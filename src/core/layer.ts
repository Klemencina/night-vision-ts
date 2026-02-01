
// Layer - render unit.
// Contains all necessary stuff:
// props, overlay, overlay environment

interface OverlaySrc {
    settings: {
        display?: boolean
    }
}

export default class Layer {
    id: number
    nvId: string
    name: string
    zIndex: number
    overlay: any
    ovSrc: OverlaySrc | null
    env: any
    ctxType: string | null
    display: boolean
    opacity: number | undefined

    constructor(id: number, name: string, nvId: string) {

        // Layer id (relative to others on the pane)
        this.id = id

        // Chart instance id
        this.nvId = nvId

        // Name / system name like __$Grid__
        this.name = name

        // Sort all overlays by zIndex
        // (higher the number - higher the layer)
        this.zIndex = 0

        // Ovelay instance
        this.overlay = null

        // Ovelay object
        this.ovSrc = null

        // Overlay environment
        this.env = null

        // Final layout (time axis + selected scale)
        //this.layout = null

        // Overlay context (renrderer type)
        this.ctxType = null

        // Show/hide
        this.display = true

        // Layer opacity (udefined === 100% visible)
        this.opacity = undefined

    }

    update(): void {
        if (!this.ovSrc) return
        this.display = this.ovSrc.settings.display ?? true
    }

}
