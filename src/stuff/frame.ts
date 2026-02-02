
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
            // The prev frame took too long
            if (Utils.now() - this.t > 100) return
            if (Utils.now() - this.t0 > 1200) {
                this.stop()
            }
            if (this.id) cb(this)
            this.t = Utils.now()
        }, 16)
    }
    stop(): void {
        if (this.id) {
            clearInterval(this.id)
        }
        this.id = null
    }
}
