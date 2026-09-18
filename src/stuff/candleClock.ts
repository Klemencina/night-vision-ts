type Subscriber = () => void

interface Clock {
    add: (subscriber: Subscriber) => () => void
}

const clocks = new WeakMap<object, Clock>()

export default function subscribeCandleClock(owner: object, subscriber: Subscriber): () => void {
    let clock = clocks.get(owner)
    if (!clock) {
        clock = createClock(owner)
        clocks.set(owner, clock)
    }
    return clock.add(subscriber)
}

function createClock(owner: object): Clock {
    const subscribers = new Set<Subscriber>()
    let timer: ReturnType<typeof setTimeout> | null = null

    function cancel(): void {
        if (timer !== null) clearTimeout(timer)
        timer = null
    }

    function schedule(): void {
        if (timer !== null || !subscribers.size || document.hidden) return
        timer = setTimeout(tick, 1000 - Date.now() % 1000)
    }

    function tick(): void {
        timer = null
        if (document.hidden) return
        for (const subscriber of [...subscribers]) {
            if (!subscribers.has(subscriber)) continue
            try {
                subscriber()
            } catch (error) {
                console.warn('Candle countdown update failed:', error)
            }
        }
        schedule()
    }

    function onVisibility(): void {
        cancel()
        if (!document.hidden) tick()
    }

    document.addEventListener('visibilitychange', onVisibility)

    return {
        add(subscriber) {
            subscribers.add(subscriber)
            schedule()
            return () => {
                if (!subscribers.delete(subscriber) || subscribers.size) return
                cancel()
                document.removeEventListener('visibilitychange', onVisibility)
                clocks.delete(owner)
            }
        }
    }
}
