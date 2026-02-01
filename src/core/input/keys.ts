// Tracking the state of keyboard (easy access)

type KeyHandler = (event?: KeyboardEvent) => void

interface Core {
    // Core interface placeholder
}

export default class Keys {
    core: Core
    map: Record<string, KeyHandler[]>
    listeners: number
    keymap: Record<string, boolean>

    constructor(core: Core) {
        this.core = core
        this.map = {}
        this.listeners = 0
        this.keymap = {}
    }

    on(name: string, handler: KeyHandler | undefined): void {
        if (!handler) return
        this.map[name] = this.map[name] || []
        this.map[name].push(handler)
        this.listeners++
    }

    // Called by Grid.svelte
    emit(name: string, event?: KeyboardEvent): void {
        if (name in this.map) {
            for (var f of this.map[name]) {
                f(event)
            }
        }
        if (name === 'keydown' && event) {
            if (!this.keymap[event.key]) {
                this.emit(event.key)
            }
            this.keymap[event.key] = true
        }
        if (name === 'keyup' && event) {
            this.keymap[event.key] = false
        }
    }

    pressed(key: string): boolean {
        return !!this.keymap[key]
    }

}
