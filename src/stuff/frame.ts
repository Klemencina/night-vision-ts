
// Annimation frame with a fallback for
// slower devices

import Utils from './utils'

export default class FrameAnimation {
    private t0: number
    private t: number
    private id: ReturnType<typeof setInterval> | null

    constructor(cb: (self: FrameAnimation) => void) {

        this.t0 = this.t = Utils.now()
        this.id = setInterval(() => {
            const now = Utils.now()
            // Stop after a stall instead of leaving an idle timer running.
            if (now - this.t > 100 || now - this.t0 > 1200) {
                this.stop()
                return
            }
            if (this.id !== null) cb(this)
            this.t = Utils.now()
        }, 16)
    }
    stop(): void {
        if (this.id !== null) {
            clearInterval(this.id)
        }
        this.id = null
    }
}
