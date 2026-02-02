
// Log-scale mode helpers

// TODO: all-negative numbers (sometimes wrong scaling)

import math from '../stuff/math'

interface ScaleSelf {
    $hi: number
    $lo: number
}

interface Props {
    config: {
        CANDLEW: number
    }
}

interface LogScale {
    candle: (self: any, mid: number, p: number[], $p: Props) => {
        x: number
        w: number
        o: number
        h: number
        l: number
        c: number
        raw: number[]
    }
    expand: (self: ScaleSelf, height: number) => void
}

const logScale: LogScale = {

    candle(self: any, mid: number, p: number[], $p: Props) {
        return {
            x: mid,
            w: self.pxStep * $p.config.CANDLEW,
            o: Math.floor(math.log(p[1]) * self.A + self.B),
            h: Math.floor(math.log(p[2]) * self.A + self.B),
            l: Math.floor(math.log(p[3]) * self.A + self.B),
            c: Math.floor(math.log(p[4]) * self.A + self.B),
            raw: p
        }
    },

    expand(self: ScaleSelf, height: number): void {
        // expand log scale
        let A = - height / (math.log(self.$hi) - math.log(self.$lo))
        let B = - math.log(self.$hi) * A

        let top = -height * 0.1
        let bot = height * 1.1

        self.$hi = math.exp((top - B) / A)
        self.$lo = math.exp((bot - B) / A)
    }

}

export default logScale
