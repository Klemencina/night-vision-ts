
// Keyboard event handler for overlay

type KeyHandler = (event: KeyboardEvent) => void

export default class Keys {

    private comp: unknown
    private map: { [name: string]: KeyHandler[] }
    private listeners: number
    private keymap: { [key: string]: boolean }

    constructor(comp: unknown) {
        this.comp = comp
        this.map = {}
        this.listeners = 0
        this.keymap = {}
    }

    on(name: string, handler: KeyHandler): void {
        if (!handler) return
        this.map[name] = this.map[name] || []
        this.map[name].push(handler)
        this.listeners++
    }

    // Called by grid.js
    emit(name: string, event: KeyboardEvent): void {
        if (name in this.map) {
            for (const f of this.map[name]) {
                f(event)
            }
        }
        if (name === 'keydown') {
            if (!this.keymap[event.key]) {
                this.emit(event.key, event)
            }
            this.keymap[event.key] = true
        }
        if (name === 'keyup') {
            this.keymap[event.key] = false
        }
    }

    pressed(key: string): boolean {
        return this.keymap[key]
    }

}
