
// Central event manager

type EventHandler = (data: unknown) => void

type EventHandlers = {
    [type: string]: {
        [component: string]: EventHandler
    }
}

class Events {
    private handlers: EventHandlers
    private id: string

    // TODO: add component call priority (think)
    // TODO: build event inspector (think)
    constructor(id: string) {
        this.id = id
        this.handlers = {}
    }

    // Immediately calls all handlers with the
    // specified type (there can be only one
    // listener of this type per each component)
    emit(type: string, obj?: unknown): void {

        // General update
        // components: { name1: h1, name2, h2, ... }
        const components = this.handlers[type]
        if (!components) return

        for (const name in components) {
            components[name](obj)
        }
    }

    // Component-specific update
    emitSpec(comp: string, type: string, obj?: unknown): void {
        const components = this.handlers[type]
        if (!components) return
        if (!components[comp]) return
        components[comp](obj)
    }

    // TODO: imlement more specific emitter, e.g.
    // emitRegex() which uses RegEx to match
    // components

    // Add event listener to a specific component:
    // '<component>:<event-type>'
    on(compAndType: string, f: EventHandler): void {
        const [comp, type] = compAndType.split(':')
        if (!this.handlers[type]) {
            this.handlers[type] = {}
        }
        this.handlers[type][comp] = f
    }

    // Remove event listeners / one listener
    off(comp: string, type?: string | null): void {
        // Remove one listener
        if (type && this.handlers[type]) {
            delete this.handlers[type][comp]
            return
        }

        // Clear all listeners on the component
        for (const t in this.handlers) {
            delete this.handlers[t][comp]
        }
    }
}

const instances: { [id: string]: Events } = {}

function instance(id: string): Events {
    if (!instances[id]) {
        instances[id] = new Events(id)
    }
    return instances[id]
}

export default { instance }
export { Events, EventHandler, EventHandlers }
