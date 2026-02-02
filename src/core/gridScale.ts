
// Grid scale is a part of layout that can vary
// depending on overlay (values that correspond to y-axis)

// TODO: feature: display only overlays on the current scale

import Const from '../stuff/constants'
import Utils from '../stuff/utils'
import math from '../stuff/math'
import logScale from './logScale'
import MetaHub from '../core/metaHub'
import ScriptHub from '../core/scripts'

const { $SCALES } = Const
const MAX_INT = Number.MAX_SAFE_INTEGER

interface Overlay {
    id: number
    settings: {
        precision?: number
        display?: boolean
    }
    dataSubset?: any[]
    type?: string
}

interface ScaleSrc {
    id: string
    gridId: number
    ovs: Overlay[]
    ovIdxs: number[]
    log: boolean
    precision?: number
}

interface Props {
    ctx: CanvasRenderingContext2D
    id: string
    config: {
        SBMIN: number
        SBMAX: number
        EXPAND: number
        GRIDY: number
        AUTO_PRE_SAMPLE: number
    }
}

interface Specs {
    props: Props
    height: number
}

interface YRangeFn {
    exec: (data: any[], h: number, l: number) => [number, number, boolean?] | null
    preCalc?: boolean
}

interface ScaleResult {
    prec: number
    sb: number
    $hi: number
    $lo: number
    A: number
    B: number
    $step?: number
    $_mult?: number
    ys: [number, number][]
    scaleSpecs: {
        id: string
        log: boolean
        ovIdxs: number[]
    }
    height: number
}

export default function Scale(id: string, src: ScaleSrc, specs: Specs): ScaleResult {

    let { props, height } = specs
    let { ctx } = props
    let meta = MetaHub.instance(props.id)
    let prefabs = ScriptHub.instance(props.id).prefabs
    let self: Partial<ScaleResult> = {}
    let yt = ((meta.yTransforms || [])[src.gridId] || [])[id as any] || null
    let gridId = src.gridId
    let ovs = src.ovs
    let ls = src.log
    const SAMPLE = props.config.AUTO_PRE_SAMPLE

    function calcSidebar(): void {

        let maxlen = Math.max(0, ...ovs.map((x: Overlay) => (x.dataSubset?.length ?? 0)))

        if (maxlen < 2) {
            self.prec = 0
            self.sb = props.config.SBMIN
            return
        }
        // TODO: add custom formatter f()
        if (src.precision !== undefined) {
            self.prec = src.precision
        } else {
            self.prec = 0
            // Find max precision over all overlays on
            // this scale
            for (var ov of ovs) {
                if (ov.settings.precision !== undefined) {
                    var prec = ov.settings.precision
                } else {
                    var prec = calcPrecision(ov)
                }
                if (prec > self.prec) self.prec = prec
            }

        }
        if (!isFinite(self.$hi!) || !isFinite(self.$lo!) ) {
            self.sb = props.config.SBMIN
            return
        }
        let lens: number[] = []
        lens.push(self.$hi!.toFixed(self.prec).length)
        lens.push(self.$lo!.toFixed(self.prec).length)
        let str = '0'.repeat(Math.max(...lens)) + '    '
        self.sb = ctx.measureText(str).width
        self.sb = Math.max(Math.floor(self.sb), props.config.SBMIN)
        self.sb = Math.min(self.sb, props.config.SBMAX)

        // Prevent sb calculation before meta data
        // extracted  from the scripts
        // if (!meta.ready) self.sb = props.config.SBMIN
    }

    // Calc vertical value range
    function calc$Range(): void {
        // Need to find minimum & maximum of selected
        // set of overlays (on the same scale)
        var hi = -Infinity, lo = Infinity
        var exp: boolean | undefined
        for (var ov of ovs) {
            if (ov.settings.display === false) continue
            let yfn: YRangeFn | null = ((meta.yRangeFns || [])[gridId] || [])[ov.id] || null
            let yfnStatic = prefabs[ov.type!]?.static?.yRange
            if (yfnStatic) {
                yfn = { 
                    exec: yfnStatic,
                    preCalc: yfnStatic.length > 1 // Do we need h & l
                }
            }
            let data = ov.dataSubset ?? []
            // Intermediate hi & lo
            var h = -Infinity, l = Infinity
            // Look for a user-defined y-range f()
            // or calculate through iteration. 'preCalc'
            // flag tells if pre-calculated h&l needed
            // TODO: implement a global auto-precision algo
            if (!yfn || (yfn && yfn.preCalc)) {
                for (var i = 0; i < data.length; i++) {
                    for (var j = 1; j < data[i].length; j++) {
                        let v = data[i][j]
                        if (v > h) h = v
                        if (v < l) l = v
                    }
                }
            }
            if (yfn) {
                // Check if result is 'null', then this overlay
                // should not affect the range at all
                var yfnResult = yfn.exec(data, h, l)
                if (yfnResult) {
                    ;[h, l, exp] = yfnResult
                } else {
                    ;[h, l] = [hi, lo]
                }
            }

            // maximum & minimum over all overlays
            if (h > hi) hi = h
            if (l < lo) lo = l
        }

        // Fixed y-range in non-auto mode
        if (yt && !yt.auto && yt.range) {
            self.$hi = yt.range[0]
            self.$lo = yt.range[1]
        } else {
            if (!ls) {
                let expVal = exp === false ? 0 : 1
                self.$hi = hi + (hi - lo) * props.config.EXPAND * expVal
                self.$lo = lo - (hi - lo) * props.config.EXPAND * expVal
            } else {
                self.$hi = hi
                self.$lo = lo
                logScale.expand(self as any, height)
            }

            if (self.$hi === self.$lo) {
                if (!ls) {
                    self.$hi! *= 1.05  // Expand if height range === 0
                    self.$lo! *= 0.95
                } else {
                    logScale.expand(self as any, height)
                }
            }
        }
    }

    // Calculate $ precision for the Y-axis of an overlay
    function calcPrecision(ov: Overlay): number {

        // Maximum digits after floating point
        let maxR = 0
        let sample: number[] = []

        // Sample N random elements from the current subset
        let f: ((dataPoint: any[]) => number | number[]) | undefined = meta.getPreSampler(gridId, ov.id)
        f = f || prefabs[ov.type!]?.static?.preSampler
        f = f || Utils.defaultPreSampler
        let subset = ov.dataSubset ?? []
        for (var i = 0; i < SAMPLE; i++) {
            // Random element n
            let n = subset.length ? Math.floor(Math.random() * subset.length) : 0
            let x = subset[n] != null ? f!(subset[n]) : null
            if (x != null) {
                if (typeof x === 'number') sample.push(x)
                else sample = sample.concat(x)
            }
        }

        sample.forEach((x: number) => {
            let right = Utils.numberLR(x)[1]
            if (right > maxR) maxR = right
        })

        // Update stored auto-precision
        let aprec = meta.getAutoPrec(gridId, ov.id)
        if (aprec === undefined || maxR > aprec) {
            meta.setAutoPrec(gridId, ov.id, maxR)
            return maxR
        }
        return aprec

    }

    function calcTransform(): void {
        // Candle Y-transform: (A = scale, B = shift)
        if (!ls) {
            self.A = - height / (self.$hi! - self.$lo!)
            self.B = - self.$hi! * self.A!
        } else {
            self.A = - height / (math.log(self.$hi!) -
                       math.log(self.$lo!))
            self.B = - math.log(self.$hi!) * self.A!
        }
    }

    // Select nearest good-loking $ step (m is target scale)
    function dollarStep(): number {
        let yrange = self.$hi! - self.$lo!
        let m = yrange * (props.config.GRIDY / height)
        let p = parseInt(yrange.toExponential().split('e')[1])
        let d = Math.pow(10, p)
        let s = ($SCALES as number[]).map((x: number) => x * d)

        // TODO: center the range (look at RSI for example,
        // it looks ugly when "80" is near the top)
        const nearestVal = Utils.nearestA(m, s)[1]
        return Utils.strip(nearestVal) ?? m
    }

    function dollarMult(): number {
        let mult_hi = dollarMultHi()
        let mult_lo = dollarMultLo()
        return Math.max(mult_hi, mult_lo)
    }

    // Price step multiplier (for the log-scale mode)
    function dollarMultHi(): number {

        let h = Math.min(self.B!, height)
        if (h < props.config.GRIDY) return 1
        let n = h / props.config.GRIDY // target grid N
        // let yrange = self.$hi // Currently unused
        let yratio: number
        if (self.$lo! > 0) {
            yratio = self.$hi! / self.$lo!
        } else {
            yratio = self.$hi! / 1 // TODO: small values
        }
        return Math.pow(yratio, 1/n)
    }

    function dollarMultLo(): number {
 
        let h = Math.min(height - self.B!, height)
        if (h < props.config.GRIDY) return 1
        let n = h / props.config.GRIDY // target grid N
        // let yrange = Math.abs(self.$lo) // Currently unused
        let yratio: number
        if (self.$hi! < 0 && self.$lo! < 0) {
            yratio = Math.abs(self.$lo! / self.$hi!)
        } else {
            yratio = Math.abs(self.$lo!) / 1
        }
        return Math.pow(yratio, 1/n)
    }

    // Build the Y-axis grid (non-log mode)
    function gridY(): void {

        // Prevent duplicate levels
        let m = Math.pow(10, -self.prec!)
        self.$step = Math.max(m, dollarStep())
        self.ys = []

        let y1 = self.$lo! - self.$lo! % self.$step

        for (var y$ = y1; y$ <= self.$hi!; y$ += self.$step) {
            let y = Math.floor(y$ * self.A! + self.B!)
            if (y > height) continue
            self.ys.push([y, Utils.strip(y$) ?? y$])
        }

    }

    // Build the Y-axis grid (log mode)
    function gridYLog(): void {

        // TODO: Prevent duplicate levels, is this even
        // a problem here ?
        self.$_mult = dollarMult()
        self.ys = []

        let v = (self.$hi! + self.$lo!) / 2 // Use mid point
        let y1 = searchStartPos(v)
        let y2 = searchStartNeg(-v)
        let yp = -Infinity // Previous y value
        let n = height / props.config.GRIDY // target grid N

        let q = 1 + (self.$_mult - 1) / 2

        // Over 0
        for (var y$ = y1; y$ > 0; y$ /= self.$_mult) {
            y$ = logRounder(y$, q)
            let y = Math.floor(math.log(y$) * self.A! + self.B!)
            self.ys.push([y, Utils.strip(y$) ?? y$])
            if (y > height) break
            if (y - yp < props.config.GRIDY * 0.7) break
            if (self.ys.length > n + 1) break
            yp = y
        }

        // Under 0
        yp = Infinity
        for (var y$ = y2; y$ < 0; y$ /= self.$_mult) {
            y$ = logRounder(y$, q)
            let y = Math.floor(math.log(y$) * self.A! + self.B!)
            if (yp - y < props.config.GRIDY * 0.7) break
            self.ys.push([y, Utils.strip(y$) ?? y$])
            if (y < 0) break
            if (self.ys.length > n * 3 + 1) break
            yp = y
        }

        // TODO: remove lines near to 0

    }

    // Search a start for the top grid so that
    // the fixed value always included
    function searchStartPos(value: number): number {
        let N = height / props.config.GRIDY // target grid N
        var y = Infinity, y$ = value, count = 0
        while (y > 0) {
            y = Math.floor(math.log(y$) * self.A! + self.B!)
            y$ *= self.$_mult!
            if (count++ > N * 3) return 0 // Prevents deadloops
        }
        return y$
    }

    function searchStartNeg(value: number): number {
        let N = height / props.config.GRIDY // target grid N
        var y = -Infinity, y$ = value, count = 0
        while (y < height) {
            y = Math.floor(math.log(y$) * self.A! + self.B!)
            y$ *= self.$_mult!
            if (count++ > N * 3) break // Prevents deadloops
        }
        return y$
    }

    // Make log scale levels look great again
    function logRounder(x: number, quality: number): number {
        let s = Math.sign(x)
        x = Math.abs(x)
        if (x > 10) {
            for (var div = 10; div < MAX_INT; div *= 10) {
                let nice = Math.floor(x / div) * div
                if (x / nice > quality) {  // More than 10% off
                    break
                }
            }
            div /= 10
            return s * Math.floor(x / div) * div
        } else if (x < 1) {
            for (var ro = 10; ro >= 1; ro--) {
                let nice = Utils.round(x, ro)
                if (x / nice > quality) {  // More than 10% off
                    break
                }
            }
            return s * Utils.round(x, ro + 1)
        } else {
            return s * Math.floor(x)
        }
    }

    calc$Range()
    calcSidebar()
    calcTransform()

    ;ls ? gridYLog() : gridY()

    // Indices of the overlays using this scale (ovIdxs).
    // Needed when the final layout is built
    // (see overlayEnv)
    self.scaleSpecs = {
        id: id,
        log: src.log,
        ovIdxs: src.ovIdxs
    }
    self.height = height

    return self as ScaleResult

}
