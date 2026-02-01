
// Resamples candles

import se from './script_engine'

const DEF_LIMIT = 5

export default function(T: string, auto = false) {
    let Ti = ['high', 'low', 'close', 'vol'].indexOf(T)

    return function(this: any, x: number, t?: number) {
        let tf = this.__tf__
        let time = t ?? (se as any).t
        let val = auto ? (se as any)[T][0] : x
        
        if (!this.__t0__ || time >= this.__t0__ + tf) {
            this.unshift(Ti !== 3 ? val : 0)
            this.__t0__ = time - time % tf
        }

        switch(Ti) {
            case 0:
                if (val > this[0]) this[0] = val
                break
            case 1:
                if (val < this[0]) this[0] = val
                break
            case 2:
                this[0] = val
                break
            case 3:
                this[0] += val
        }

        this.length = this.__len__ || DEF_LIMIT
    }
}
