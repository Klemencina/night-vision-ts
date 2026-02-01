
/* Listens to native keyboard events,
   propagates to all overlays through Grid */

interface Events {
    emitSpec: (id: string, event: string, data: any) => void
}

export default class Keyboard {
    private _keydown: (e: KeyboardEvent) => void
    private _keyup: (e: KeyboardEvent) => void
    private _keypress: (e: KeyboardEvent) => void
    private events: Events
    private updId: string

    constructor(updId: string, events: Events) {
        this._keydown = this.keydown.bind(this)
        this._keyup = this.keyup.bind(this)
        this._keypress = this.keypress.bind(this)
        window.addEventListener('keydown', this._keydown)
        window.addEventListener('keyup', this._keyup)
        window.addEventListener('keypress', this._keypress)
        this.events = events
        this.updId = updId
    }

    off(): void {
        window.removeEventListener('keydown', this._keydown)
        window.removeEventListener('keyup', this._keyup)
        window.removeEventListener('keypress', this._keypress)
    }

    keydown(event: KeyboardEvent): void {
        this.events.emitSpec(this.updId, 'propagate', {
            name: 'keydown',
            event: event
        })
    }

    keyup(event: KeyboardEvent): void {
        this.events.emitSpec(this.updId, 'propagate', {
            name: 'keyup',
            event: event
        })
    }

    keypress(event: KeyboardEvent): void {
        this.events.emitSpec(this.updId, 'propagate', {
            name: 'keypress',
            event: event
        })
    }
}
