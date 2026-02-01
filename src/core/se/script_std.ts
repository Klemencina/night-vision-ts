
// Script std-lib (built-in functions)

import se from './script_engine'
import linreg from '../../stuff/linreg'
import Utils from '../../stuff/utils'
import * as u from './script_utils'
import Sampler from './sampler'
import { Sym, ARR, TSS, NUM } from './symbol'
import View from './view'

const BUF_INC = 5

// TimeSeries type - array with special properties
export interface TimeSeries extends Array<number> {
    __id__: string
    __len__?: number
    __tf__?: number
    __fn__?: (x: number, t?: number) => void
    __offset__?: number
    __t0__?: number
}

// Environment type
export interface ScriptEnv {
    src: {
        props: { [key: string]: any }
        sett: { [key: string]: any }
    }
    tss: { [key: string]: TimeSeries }
    syms: { [key: string]: Sym }
    views: { [key: string]: View }
    chart: { [key: string]: any }
    onchart: { [key: string]: any }
    offchart: { [key: string]: any }
    shared: {
        vol?: TimeSeries
        onclose?: boolean
        [key: string]: any
    }
    send_modify: (update: any) => void
}

export default class ScriptStd {
    env: ScriptEnv
    se: typeof se
    SWMA: number[]
    STDEV_EPS: number
    STDEV_Z: number

    constructor(env: ScriptEnv) {
        this.env = env
        this.se = se

        this.SWMA = [1/6, 2/6, 2/6, 1/6]
        this.STDEV_EPS = 1e-10
        this.STDEV_Z = 1e-4

        this._index_tracking()
    }

    // Wrap every index with index-tracking function
    // That way we will know exact index ranges
    _index_tracking(): void {
        let proto = Object.getPrototypeOf(this)
        for (var k of Object.getOwnPropertyNames(proto)) {
            switch(k) {
                case 'constructor':
                case 'ts':
                case 'tstf':
                case 'sample':
                case '_index_tracking':
                case '_tsid':
                case '_i':
                case '_v':
                case '_add_i':
                case 'chart':
                case 'sym':
                case 'view':
                case 'prop':
                case 'autoPrec':
                    continue
            }
            let f = (this as any)[k]
            if (typeof f === 'function') {
                let f2 = this._add_i(k, f.toString())
                if (f2) (this as any)[k] = f2
            }
        }
    }

    /**
     * Declare new script property
     * @param name - Property name
     * @param descr - Property descriptor
     */
    prop(name: string, descr: { def: any }): void {
        let props = this.env.src.props
        if (!(name in props)) {
            props[name] = descr.def
        }
    }

    /**
     * Get precision of ohlc dataset
     * @return Ohlc precision
     */
    autoPrec(): number | undefined {
        if (!se.data.ohlcv) return undefined
        let data = se.data.ohlcv.data
        let len = data.length
        let i0 = Math.max(0, len - 100)
        let max = 0
        for (var i = i0; i < len; i++) {
            let p = data[i]
            for (var k = 1; k < 5; k++) {
                let r = Utils.numberLR(p[k])[1]
                if (r > max) max = r
            }
        }
        return max
    }

    // Add index tracking to the function
    _add_i(name: string, src: string): Function | null {
        let args = u.f_args(src)
        src = u.f_body(src)
        let src2 = u.wrap_idxs(src, 'this.')
        if (src2 !== src) {
            return new Function(...args, src2)
        }
        return null
    }

    // Generate the next timeseries id
    _tsid(prev: string, next: string): string {
        // TODO: prev presence check
        return `${prev}<-${next}`
    }

    // Index-tracker
    _i(i: number, x: any): number {
        // If an object is actually a timeseries
        if (x != undefined && x === x && x.__id__) {
            // Increase TS buff length
            if (!x.__len__ || i >= x.__len__) {
                x.__len__ = i + BUF_INC
            }
        }
        return i
    }

    // Index-tracker (object-based)
    _v(x: any, i: number): any {
        // If an object is actually a timeseries
        if (x != undefined && x === x && x.__id__) {
            // Increase TS buff length
            if (!x.__len__ || i >= x.__len__) {
                x.__len__ = i + BUF_INC
            }
        }
        return x
    }

    /**
     * Creates a new time-series & records each x.
     * Returns an array. Id is auto-generated
     * @param x - A variable to sample from
     * @return New time-series
     */
    ts(x: number | undefined, _id: string, _tf?: number): TimeSeries {
        if (_tf) return this.tstf(x ?? 0, _tf, _id)
        let ts = this.env.tss[_id]
        if (!ts) {
            ts = this.env.tss[_id] = [x ?? 0] as TimeSeries
            ts.__id__ = _id
        } else {
            ts[0] = x ?? 0
        }
        return ts
    }

    /**
     * Creates a new time-series & records each x.
     * Uses Sampler to aggregate the values
     * Return the an array. Id is auto-generated
     * @param x - A variable to sample from
     * @param tf - Timeframe in ms or as a string
     * @return New time-series
     */
    tstf(x: number, tf: number | string, _id: string): TimeSeries {
        let ts = this.env.tss[_id]
        if (!ts) {
            ts = this.env.tss[_id] = [x] as TimeSeries
            ts.__id__ = _id
            ts.__tf__ = u.tf_from_str(tf)
            ts.__fn__ = Sampler('close').bind(ts) as (x: number, t?: number) => void
        } else {
            ts.__fn__!(x)
        }
        return ts
    }

    /**
     * Creates a new custom sampler.
     * Return the an array. Id is auto-generated
     * @param x - A variable to sample from
     * @param type - Sampler type
     * @param tf - Timeframe in ms or as a string
     * @return New time-series
     */
    sample(x: number, type: string, tf: number | string, _id: string): TimeSeries {
        let ts = this.env.tss[_id]
        if (!ts) {
            ts = this.env.tss[_id] = [x] as TimeSeries
            ts.__id__ = _id
            ts.__tf__ = u.tf_from_str(tf)
            ts.__fn__ = Sampler(type).bind(ts) as (x: number, t?: number) => void
        } else {
            ts.__fn__!(x)
        }
        return ts
    }

    /**
     * Replaces the variable if it's NaN
     * @param x - The variable
     * @param v - A value to replace with
     * @return New value
     */
    nz(x: any, v?: any): any {
        if (x == undefined || x !== x) {
            return v || 0
        }
        return x
    }

    /**
     * Is the variable NaN ?
     * @param x - The variable
     * @return New value
     */
    na(x: any): boolean {
        return x == undefined || x !== x
    }

    /** Replaces the var with NaN if Infinite
     * @param x - The variable
     * @param v - A value to replace with
     * @return New value
     */
    nf(x: number, v?: any): number {
        if (!isFinite(x)) {
            return v !== undefined ? v : NaN
        }
        return x
    }

    // Math operators on t-series and numbers

    /** Adds values / time-series
     * @param x - First input
     * @param y - Second input
     * @return New time-series
     */
    add(x: TimeSeries | number, y: TimeSeries | number, _id: string): TimeSeries {
        // __id__ means this is a time-series
        let id = this._tsid(_id, `add`)
        let x0 = this.na(x) ? NaN : ((x as TimeSeries).__id__ ? (x as TimeSeries)[0] : x as number)
        let y0 = this.na(y) ? NaN : ((y as TimeSeries).__id__ ? (y as TimeSeries)[0] : y as number)
        return this.ts(x0 + y0, id, (x as TimeSeries).__tf__)
    }

    /** Subtracts values / time-series
     * @param x - First input
     * @param y - Second input
     * @return New time-series
     */
    sub(x: TimeSeries | number, y: TimeSeries | number, _id: string): TimeSeries {
        let id = this._tsid(_id, `sub`)
        let x0 = this.na(x) ? NaN : ((x as TimeSeries).__id__ ? (x as TimeSeries)[0] : x as number)
        let y0 = this.na(y) ? NaN : ((y as TimeSeries).__id__ ? (y as TimeSeries)[0] : y as number)
        return this.ts(x0 - y0, id, (x as TimeSeries).__tf__)
    }

    /** Multiplies values / time-series
     * @param x - First input
     * @param y - Second input
     * @return New time-series
     */
    mult(x: TimeSeries | number, y: TimeSeries | number, _id: string): TimeSeries {
        let id = this._tsid(_id, `mult`)
        let x0 = this.na(x) ? NaN : ((x as TimeSeries).__id__ ? (x as TimeSeries)[0] : x as number)
        let y0 = this.na(y) ? NaN : ((y as TimeSeries).__id__ ? (y as TimeSeries)[0] : y as number)
        return this.ts(x0 * y0, id, (x as TimeSeries).__tf__)
    }

    /** Divides values / time-series
     * @param x - First input
     * @param y - Second input
     * @return New time-series
     */
    div(x: TimeSeries | number, y: TimeSeries | number, _id: string): TimeSeries {
        let id = this._tsid(_id, `div`)
        let x0 = this.na(x) ? NaN : ((x as TimeSeries).__id__ ? (x as TimeSeries)[0] : x as number)
        let y0 = this.na(y) ? NaN : ((y as TimeSeries).__id__ ? (y as TimeSeries)[0] : y as number)
        return this.ts(x0 / y0, id, (x as TimeSeries).__tf__)
    }

    /** Returns a negative value / time-series
     * @param x - Input
     * @return New time-series
     */
    neg(x: TimeSeries | number, _id: string): TimeSeries {
        let id = this._tsid(_id, `neg`)
        let x0 = this.na(x) ? NaN : ((x as TimeSeries).__id__ ? (x as TimeSeries)[0] : x as number)
        return this.ts(-x0, id, (x as TimeSeries).__tf__)
    }

    /** Absolute value
     * @param x - Input
     * @return Absolute value
     */
    abs(x: number): number {
        return Math.abs(x)
    }

    /** Arccosine function
     * @param x - Input
     * @return Arccosine of x
     */
    acos(x: number): number {
        return Math.acos(x)
    }

    /** Emits an event to DataCube
     * @param type - Signal type
     * @param data - Signal data
     */
    signal(type: string, data: any = {}): void {
        if ((this.se as any).shared.event !== 'update') return
        this.se.send('script-signal', { type, data })
    }

    /** Emits an event if cond === true
     * @param cond - The condition
     * @param type - Signal type
     * @param data - Signal data
     */
    signalif(cond: boolean | TimeSeries, type: string, data: any = {}): void {
        if ((this.se as any).shared.event !== 'update') return
        let condVal = cond && (cond as TimeSeries).__id__ ? (cond as TimeSeries)[0] : cond
        if (condVal) {
            this.se.send('script-signal', { type, data })
        }
    }

    /** Arnaud Legoux Moving Average
     * @param src - Input
     * @param len - Length
     * @param offset - Offset
     * @param sigma - Sigma
     * @return New time-series
     */
    alma(src: TimeSeries, len: number, offset: number, sigma: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `alma(${len},${offset},${sigma})`)
        let m = Math.floor(offset * (len - 1))
        let s = len / sigma
        let norm = 0
        let sum = 0
        for (var i = 0; i < len; i++) {
            let w = Math.exp(-1 * Math.pow(i - m, 2) / (2 * Math.pow(s, 2)))
            norm = norm + w
            sum = sum + src[len - i - 1] * w
        }
        return this.ts(sum / norm, id, src.__tf__)
    }

    /** Arcsine function
     * @param x - Input
     * @return Arcsine of x
     */
    asin(x: number): number {
        return Math.asin(x)
    }

    /** Arctangent function
     * @param x - Input
     * @return Arctangent of x
     */
    atan(x: number): number {
        return Math.atan(x)
    }

    /** Average True Range
     * @param len - Length
     * @return New time-series
     */
    atr(len: number, _id: string, _tf?: number): TimeSeries {
        let tfs = _tf || ''
        let id = this._tsid(_id, `atr(${len})`)
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let close = this.env.shared[`close${tfs}`]
        let tr = this.ts(0, id, _tf)
        tr[0] = this.na(high[1]) ? high[0] - low[0] :
            Math.max(
                Math.max(
                    high[0] - low[0],
                    Math.abs(high[0] - close[1])
                ),
                Math.abs(low[0] - close[1])
            )
        return this.rma(tr, len, id)
    }

    /** Average of arguments
     * @param args - Numeric values
     * @return Average value
     */
    avg(...args: any[]): number {
        args.pop() // Remove _id
        let sum = 0
        for (var i = 0; i < args.length; i++) {
            sum += args[i]
        }
        return sum / args.length
    }

    /** Candles since the event occured (cond === true)
     * @param cond - the condition
     * @return New time-series
     */
    since(cond: boolean | TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `since()`)
        let condVal = cond && (cond as TimeSeries).__id__ ? (cond as TimeSeries)[0] : cond
        let s = this.ts(undefined, id)
        s[0] = condVal ? 0 : s[1] + 1
        return s
    }

    /** Bollinger Bands
     * @param src - Input
     * @param len - Length
     * @param mult - Multiplier
     * @return Array of new time-series (3 bands)
     */
    bb(src: TimeSeries, len: number, mult: number, _id: string): TimeSeries[] {
        let id = this._tsid(_id, `bb(${len},${mult})`)
        let basis = this.sma(src, len, id)
        let dev = this.stdev(src, len, id)[0] * mult
        return [
            basis,
            this.ts(basis[0] + dev, id + '1', src.__tf__),
            this.ts(basis[0] - dev, id + '2', src.__tf__)
        ]
    }

    /** Bollinger Bands Width
     * @param src - Input
     * @param len - Length
     * @param mult - Multiplier
     * @return New time-series
     */
    bbw(src: TimeSeries, len: number, mult: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `bbw(${len},${mult})`)
        let basis = this.sma(src, len, id)[0]
        let dev = this.stdev(src, len, id)[0] * mult
        return this.ts(2 * dev / basis, id, src.__tf__)
    }

    /** Converts the variable to Boolean
     * @param x The variable
     * @return Boolean value
     */
    bool(x: any): boolean {
        return !!x
    }

    /** Commodity Channel Index
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    cci(src: TimeSeries, len: number, _id: string): TimeSeries {
        // TODO: Not exactly precise, but pretty damn close
        let id = this._tsid(_id, `cci(${len})`)
        let ma = this.sma(src, len, id)
        let dev = this.dev(src, len, id)
        let cci = (src[0] - ma[0]) / (0.015 * dev[0])
        return this.ts(cci, id, src.__tf__)
    }

    /** Shortcut for Math.ceil()
     * @param x The variable
     * @return Ceiling value
     */
    ceil(x: number): number {
        return Math.ceil(x)
    }

    /** Change: x[0] - x[len]
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    change(src: TimeSeries, len: number = 1, _id: string): TimeSeries {
        let id = this._tsid(_id, `change(${len})`)
        return this.ts(src[0] - src[len], id, src.__tf__)
    }

    /** Chande Momentum Oscillator
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    cmo(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `cmo(${len})`)
        let mom = this.change(src, 1, id)

        let g = this.ts(mom[0] >= 0 ? mom[0] : 0.0, id+"g", src.__tf__)
        let l = this.ts(mom[0] >= 0 ? 0.0 : -mom[0], id+"l", src.__tf__)

        let sm1 = this.sum(g, len, id+'1')[0]
        let sm2 = this.sum(l, len, id+'2')[0]

        return this.ts(100 * (sm1 - sm2) / (sm1 + sm2), id, src.__tf__)
    }

    /** Center of Gravity
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    cog(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `cmo(${len})`)
        let sum = this.sum(src, len, id)[0]
        let num = 0
        for (var i = 0; i < len; i++) {
            num += src[i] * (i + 1)
        }
        return this.ts(-num / sum, id, src.__tf__)
    }

    // Correlation
    corr(): void {
        // TODO: this
    }

    /** Cosine function
     * @param x - Input
     * @return Cosine of x
     */
    cos(x: number): number {
        return Math.cos(x)
    }

    /** When one time-series crosses another
     * @param src1 - TS1
     * @param src2 - TS2
     * @return New time-series
     */
    cross(src1: TimeSeries, src2: TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `cross`)
        let x = (src1[0] > src2[0]) !== (src1[1] > src2[1])
        return this.ts(x as any, id, src1.__tf__)
    }

    /** When one time-series goes over another one
     * @param src1 - TS1
     * @param src2 - TS2
     * @return New time-series
     */
    crossover(src1: TimeSeries, src2: TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `crossover`)
        let x = (src1[0] > src2[0]) && (src1[1] <= src2[1])
        return this.ts(x as any, id, src1.__tf__)
    }

    /** When one time-series goes under another one
     * @param src1 - TS1
     * @param src2 - TS2
     * @return New time-series
     */
    crossunder(src1: TimeSeries, src2: TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `crossunder`)
        let x = (src1[0] < src2[0]) && (src1[1] >= src2[1])
        return this.ts(x as any, id, src1.__tf__)
    }

    /** Sum of all elements of src
     * @param src - Input
     * @return New time-series
     */
    cum(src: TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `cum`)
        let res = this.ts(0, id, src.__tf__)
        res[0] = this.nz(src[0]) + this.nz(res[1])
        return res
    }

    /** Day of month, literally
     * @param time - Time in ms (current t, if not defined)
     * @return Day
     */
    dayofmonth(time?: number): number {
        return new Date(time || (se as any).t).getUTCDate()
    }

    /** Day of week, literally
     * @param time - Time in ms (current t, if not defined)
     * @return Day
     */
    dayofweek(time?: number): number {
        return new Date(time || (se as any).t).getUTCDay() + 1
    }

    /** Deviation from SMA
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    dev(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `dev(${len})`)
        let mean = this.sma(src, len, id)[0]
        let sum = 0
        for (var i = 0; i < len; i++) {
            sum += Math.abs(src[i] - mean)
        }
        return this.ts(sum / len, id, src.__tf__)
    }

    /** Directional Movement Index ADX, +DI, -DI
     * @param len - Length
     * @param smooth - Smoothness
     * @return New time-series
     */
    dmi(len: number, smooth: number, _id: string, _tf?: number): TimeSeries[] {
        let id = this._tsid(_id, `dmi(${len},${smooth})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let up = this.change(high, 1, id+'1')[0]
        let down = this.neg(this.change(low, 1, id+'2'), id)[0]

        let plusDM = this.ts(100 * (
            this.na(up) ? NaN :
            (up > down && up > 0 ? up : 0)), id+'3', _tf
        )
        let minusDM = this.ts(100 * (
            this.na(down) ? NaN :
            (down > up && down > 0 ? down : 0)), id+'4', _tf
        )

        let trur = this.rma(this.tr(false, id, _tf), len, id+'5')
        let plus = this.div(
            this.rma(plusDM, len, id+'6'), trur, id+'8')
        let minus = this.div(
            this.rma(minusDM, len, id+'7'), trur, id+'9')
        let sum = this.add(plus, minus, id+'10')[0]
        let adx = this.rma(
            this.ts(100 * Math.abs(plus[0] - minus[0]) /
            (sum === 0 ? 1 : sum), id+'11', _tf),
            smooth, id+'12'
        )
        return [adx, plus, minus]
    }

    /** Exponential Moving Average with alpha = 2 / (y + 1)
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    ema(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `ema(${len})`)
        let a = 2 / (len + 1)
        let ema = this.ts(0, id, src.__tf__)
        ema[0] = this.na(ema[1]) ?
            this.sma(src, len, id)[0] :
            a * src[0] + (1 - a) * this.nz(ema[1])
        return ema
    }

    /** Shortcut for Math.exp()
     * @param x The variable
     * @return Exponential value
     */
    exp(x: number): number {
        return Math.exp(x)
    }

    /** Test if "src" TS is falling for "len" candles
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    falling(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `falling(${len})`)
        let bot = src[0]
        for (var i = 1; i < len + 1; i++) {
            if (bot >= src[i]) {
                return this.ts(false as any, id, src.__tf__)
            }
        }
        return this.ts(true as any, id, src.__tf__)
    }

    /** For a given series replaces NaN values with
     * previous nearest non-NaN value
     * @param src - Input time-series
     * @return Fixed time-series
     */
    fixnan(src: TimeSeries): TimeSeries {
        if (this.na(src[0])) {
            for (var i = 1; i < src.length; i++) {
                if (!this.na(src[i])) {
                    src[0] = src[i]
                    break
                }
            }
        }
        return src
    }

    /** Shortcut for Math.floor()
     * @param x The variable
     * @return Floor value
     */
    floor(x: number): number {
        return Math.floor(x)
    }

    /** Highest value for a given number of candles back
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    highest(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `highest(${len})`)
        let high = -Infinity
        for (var i = 0; i < len; i++) {
            if (src[i] > high) high = src[i]
        }
        return this.ts(high, id, src.__tf__)
    }

    /** Highest value offset for a given number of bars back
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    highestbars(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `highestbars(${len})`)
        let high = -Infinity
        let hi = 0
        for (var i = 0; i < len; i++) {
            if (src[i] > high) { high = src[i], hi = i }
        }
        return this.ts(-hi, id, src.__tf__)
    }

    /** Hull Moving Average
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    hma(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `hma(${len})`)
        let len2 = Math.floor(len/2)
        let len3 = Math.round(Math.sqrt(len))

        let a = this.mult(this.wma(src, len2, id+'1'), 2, id)
        let b = this.wma(src, len, id+'2')
        let delt = this.sub(a, b, id+'3')

        return this.wma(delt, len3, id+'4')
    }

    /** Returns hours of a given timestamp
     * @param time - Time in ms (current t, if not defined)
     * @return Hour
     */
    hour(time?: number): number {
        return new Date(time || (se as any).t).getUTCHours()
    }

    /** Returns x or y depending on the condition
     * @param cond - Condition
     * @param x - First value
     * @param y - Second value
     * @return Selected value
     */
    iff(cond: boolean | TimeSeries, x: any, y: any): any {
        let condVal = cond && (cond as TimeSeries).__id__ ? (cond as TimeSeries)[0] : cond
        return condVal ? x : y
    }

    /** Keltner Channels
     * @param src - Input
     * @param len - Length
     * @param mult - Multiplier
     * @param use_tr - Use true range
     * @return Array of new time-series (3 bands)
     */
    kc(src: TimeSeries, len: number, mult: number, use_tr: boolean = true, _id: string, _tf?: number): TimeSeries[] {
        let id = this._tsid(_id, `kc(${len},${mult},${use_tr})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let basis = this.ema(src, len, id+'1')

        let range = use_tr ?
            this.tr(false, id+'2', _tf) :
            this.ts(high[0] - low[0], id+'3', src.__tf__)
        let ema = this.ema(range, len, id+'4')

        return [
            basis,
            this.ts(basis[0] + ema[0] * mult, id+'5', src.__tf__),
            this.ts(basis[0] - ema[0] * mult, id+'6', src.__tf__)
        ]
    }

    /** Keltner Channels Width
     * @param src - Input
     * @param len - Length
     * @param mult - Multiplier
     * @param use_tr - Use true range
     * @return New time-series
     */
    kcw(src: TimeSeries, len: number, mult: number, use_tr: boolean = true, _id: string, _tf?: number): TimeSeries {
        let id = this._tsid(_id, `kcw(${len},${mult},${use_tr})`)
        let kc = this.kc(src, len, mult, use_tr, `kcw`, _tf)
        return this.ts((kc[1][0] - kc[2][0]) / kc[0][0], id, src.__tf__)
    }

    /** Linear Regression
     * @param src - Input
     * @param len - Length
     * @param offset - Offset
     * @return New time-series
     */
    linreg(src: TimeSeries, len: number, offset: number = 0, _id: string): TimeSeries {
        let id = this._tsid(_id, `linreg(${len})`)

        src.__len__ = Math.max(src.__len__ || 0, len)
        let lr = linreg(src, len, offset)

        return this.ts(lr, id, src.__tf__)
    }

    /** Shortcut for Math.log()
     * @param x The variable
     * @return Log value
     */
    log(x: number): number {
        return Math.log(x)
    }

    /** Shortcut for Math.log10()
     * @param x The variable
     * @return Log10 value
     */
    log10(x: number): number {
        return Math.log10(x)
    }

    /** Lowest value for a given number of candles back
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    lowest(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `lowest(${len})`)
        let low = Infinity
        for (var i = 0; i < len; i++) {
            if (src[i] < low) low = src[i]
        }
        return this.ts(low, id, src.__tf__)
    }

    /** Lowest value offset for a given number of bars back
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    lowestbars(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `lowestbars(${len})`)
        let low = Infinity
        let li = 0
        for (var i = 0; i < len; i++) {
            if (src[i] < low) { low = src[i], li = i }
        }
        return this.ts(-li, id, src.__tf__)
    }

    /** Moving Average Convergence/Divergence
     * @param src - Input
     * @param fast - Fast EMA
     * @param slow - Slow EMA
     * @param sig - Signal
     * @return [macd, signal, hist]
     */
    macd(src: TimeSeries, fast: number, slow: number, sig: number, _id: string): TimeSeries[] {
        let id = this._tsid(_id, `macd(${fast}${slow}${sig})`)
        let fast_ma = this.ema(src, fast, id+'1')
        let slow_ma = this.ema(src, slow, id+'2')
        let macd = this.sub(fast_ma, slow_ma, id+'3')
        let signal = this.ema(macd, sig, id+'4')
        let hist = this.sub(macd, signal, id+'5')
        return [macd, signal, hist]
    }

    /** Max of arguments
     * @param args - Numeric values
     * @return Maximum value
     */
    max(...args: any[]): number {
        args.pop() // Remove _id
        return Math.max(...args)
    }

    /** Sends update to some overlay / main chart
     * @param id - Overlay id
     * @param fields - Fields to be overwritten
     */
    modify(id: string, fields: any): void {
        se.send('modify-overlay', { uuid:id, fields })
    }

    /** Sets the reverse buffer size for a given
     * time-series (default = 5, grows on demand)
     * @param src - Input
     * @param len - New length
     */
    buffsize(src: TimeSeries, len: number): void {
        src.__len__ = len
    }

    /** Money Flow Index
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    mfi(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `mfi(${len})`)
        let vol = this.env.shared.vol
        let ch = this.change(src, 1, id+'1')[0]

        let ts1 = this.mult(vol!, ch <= 0.0 ? 0.0 : src[0], id+'2')
        let ts2 = this.mult(vol!, ch >= 0.0 ? 0.0 : src[0], id+'3')

        let upper = this.sum(ts1, len, id+'4')
        let lower = this.sum(ts2, len, id+'5')

        let res: number | undefined = undefined
        if (!this.na(lower)) {
            res = this.rsi(upper, lower, id+'6')[0]
        }
        return this.ts(res!, id, src.__tf__)
    }

    /** Min of arguments
     * @param args - Numeric values
     * @return Minimum value
     */
    min(...args: any[]): number {
        args.pop() // Remove _id
        return Math.min(...args)
    }

    /** Returns minutes of a given timestamp
     * @param time - Time in ms (current t, if not defined)
     * @return Minutes
     */
    minute(time?: number): number {
        return new Date(time || (se as any).t).getUTCMinutes()
    }

    /** Momentum
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    mom(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `mom(${len})`)
        return this.ts(src[0] - src[len], id, src.__tf__)
    }

    /** Month
     * @param time - Time in ms (current t, if not defined)
     * @return Month
     */
    month(time?: number): number {
        return new Date(time || (se as any).t).getUTCMonth()
    }

    /** Display data point as the main chart
     * @param x - Data point / TS / array of TS
     * @param sett - Object with settings & OV type
     */
    chart(x: TimeSeries | TimeSeries[] | any, sett: any = {}, _id: string): void {
        let view = sett.view || 'main'
        let off = 0
        if (x && x.__id__) {
            off = x.__offset__ || 0
            x = x[0]
        }
        if (Array.isArray(x) && x[0] && x[0].__id__) {
            off = x[0].__offset__ || 0
            x = x.map((x: any) => x[0])
        }
        if (!this.env.chart[view]) {
            let type = sett.type
            sett.$synth = true
            sett.skipNaN = true
            this.env.chart[view] = {
                type: type || 'Candles',
                data: [],
                settings: sett,
                view: view,
                vprops: sett.vprops,
                indexBased: sett.vprops.ib,
                tf: sett.vprops.tf
            }
            delete sett.type
            delete sett.vprops
            delete sett.view
        }
        off *= (se as any).tf
        let v = Array.isArray(x) ?
            [(se as any).t + off, ...x] : [(se as any).t + off, x]
        u.update(this.env.chart[view].data, v)
    }

    /** Returns true when the candle(tf) is being closed
     * (create a new overlay in DataCube)
     * @param tf - Timeframe in ms or as a string
     * @return Boolean
     */
    onclose(tf: number | string): boolean {
        if (!this.env.shared.onclose) return false
        if (!tf) tf = (se as any).tf
        let tfVal = u.tf_from_str(tf) || (se as any).tf
        return ((se as any).t + (se as any).tf) % tfVal === 0
    }

    /** Sends settings update
     * (can be called from init(), update() or post())
     * @param upd - Settings update (object to merge)
     */
    settings(upd: any): void {
        this.env.send_modify({ settings: upd })
        Object.assign(this.env.src.sett, upd)
    }

    /** Shifts TS left or right by "num" candles
     * @param src - Input time-series
     * @param num - Offset measured in candles
     * @return New / existing time-series
     */
    offset(src: TimeSeries | number, num: number, _id: string): TimeSeries {
        if ((src as TimeSeries).__id__) {
            (src as TimeSeries).__offset__ = num
            return src as TimeSeries
        }
        let id = this._tsid(_id, `offset(${num})`)
        let out = this.ts(src as number, id)
        out.__offset__ = num
        return out
    }

    // percentile_linear_interpolation
    linearint(): void {
        // TODO: this
    }

    // percentile_nearest_rank
    nearestrank(): void {
        // TODO: this
    }

    /** The current time
     * @return timestamp
     */
    now(): number {
        return new Date().getTime()
    }

    percentrank(): void {
        // TODO: this
    }

    /** Returns price of the pivot high point
     * Tip: works best with `offset` function
     * @param src - Input
     * @param left - left threshold, candles
     * @param right - right threshold, candles
     * @return New time-series
     */
    pivothigh(src: TimeSeries, left: number, right: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `pivothigh(${left},${right})`)

        let len = left + right + 1
        let top = src[right]
        for (var i = 0; i < len; i++) {
            if (top <= src[i] && i !== right) {
                return this.ts(NaN, id, src.__tf__)
            }
        }
        return this.ts(top, id, src.__tf__)
    }

    /** Returns price of the pivot low point
     * Tip: works best with `offset` function
     * @param src - Input
     * @param left - left threshold, candles
     * @param right - right threshold, candles
     * @return New time-series
     */
    pivotlow(src: TimeSeries, left: number, right: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `pivotlow(${left},${right})`)

        let len = left + right + 1
        let bot = src[right]
        for (var i = 0; i < len; i++) {
            if (bot >= src[i] && i !== right) {
                return this.ts(NaN, id, src.__tf__)
            }
        }
        return this.ts(bot, id, src.__tf__)
    }

    /** Shortcut for Math.pow()
     * @param x The base
     * @param y The exponent
     * @return Power value
     */
    pow(x: number, y: number): number {
        return Math.pow(x, y)
    }

    /** Test if "src" TS is rising for "len" candles
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    rising(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `rising(${len})`)
        let top = src[0]
        for (var i = 1; i < len + 1; i++) {
            if (top <= src[i]) {
                return this.ts(false as any, id, src.__tf__)
            }
        }
        return this.ts(true as any, id, src.__tf__)
    }

    /** Exponentially MA with alpha = 1 / length
     * Used in RSI
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    rma(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `rma(${len})`)
        let a = len
        let sum = this.ts(0, id, src.__tf__)
        sum[0] = this.na(sum[1]) ?
            this.sma(src, len, id)[0] :
            (src[0] + (a - 1) * this.nz(sum[1])) / a
        return sum
    }

    /** Rate of Change
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    roc(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `roc(${len})`)
        return this.ts(
            100 * (src[0] - src[len]) / src[len], id, src.__tf__
        )
    }

    /** Shortcut for Math.round()
     * @param x The variable
     * @return Rounded value
     */
    round(x: number): number {
        return Math.round(x)
    }

    /** Relative Strength Index
     * @param x - First Input
     * @param y - Second Input
     * @return New time-series
     */
    rsi(x: TimeSeries, y: number | TimeSeries, _id: string): TimeSeries {
        // Check if y is a timeseries
        let id: string
        let rsi: number
        if (!this.na(y) && (y as TimeSeries).__id__) {
            id = this._tsid(_id, `rsi(x,y)`)
            rsi = 100 - 100 / (1 + this.div(x, y as TimeSeries, id)[0])
        } else {
            id = this._tsid(_id, `rsi(${y})`)
            let ch = this.change(x, 1, _id)[0]
            let pc = this.ts(Math.max(ch, 0), id+'1', x.__tf__)
            let nc = this.ts(-Math.min(ch, 0), id+'2', x.__tf__)
            let up = this.rma(pc, y as number, id+'3')[0]
            let down = this.rma(nc, y as number, id+'4')[0]
            rsi = down === 0 ? 100 : (
                up === 0 ? 0 : (100 - (100 / (1 + up / down)))
            )
        }
        return this.ts(rsi, id+'5', x.__tf__)
    }

    /** Parabolic SAR
     * @param start - Start
     * @param inc - Increment
     * @param max - Maximum
     * @return New time-series
     */
    sar(start: number, inc: number, max: number, _id: string, _tf?: number): TimeSeries {
        // Source: Parabolic SAR by imuradyan
        // TODO: simplify the code
        // TODO: fix the custom TF mode
        let id = this._tsid(_id, `sar(${start},${inc},${max})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let close = this.env.shared[`close${tfs}`]

        let minTick = 0 //1e-7
        let out = this.ts(undefined, id+'1', _tf)
        let pos = this.ts(undefined, id+'2', _tf)
        let maxMin = this.ts(undefined, id+'3', _tf)
        let acc = this.ts(undefined, id+'4', _tf)
        let n = _tf ? out.__len__! - 1 : (this.se as any).iter
        let prev: number
        let outSet = false

        if (n >= 1) {
            prev = out[1]
            if (n === 1) {
                if (close[0] > close[1]) {
                    pos[0] = 1
                    maxMin[0] = Math.max(high[0], high[1])
                    prev = Math.min(low[0], low[1])
                } else {
                    pos[0] = -1
                    maxMin[0] = Math.min(low[0], low[1])
                    prev = Math.max(high[0], high[1])
                }
                acc[0] = start
            } else {
                pos[0] = pos[1]
                acc[0] = acc[1]
                maxMin[0] = maxMin[1]
            }
            if (pos[0] === 1) {
                if (high[0] > maxMin[0]) {
                    maxMin[0] = high[0]
                    acc[0] = Math.min(acc[0] + inc, max)
                }
                if (low[0] <= prev) {
                    pos[0] = -1
                    out[0] = maxMin[0]
                    maxMin[0] = low[0]
                    acc[0] = start
                    outSet = true
                }
            } else {
                if (low[0] < maxMin[0]) {
                    maxMin[0] = low[0]
                    acc[0] = Math.min(acc[0] + inc, max)
                }

                if (high[0] >= prev) {
                    pos[0] = 1
                    out[0] = maxMin[0]
                    maxMin[0] = high[0]
                    acc[0] = start
                    outSet = true
                }
            }

            if (!outSet) {
                out[0] = prev + acc[0] * (maxMin[0] - prev)

                if (pos[0] === 1)
                    if (out[0] >= low[0])
                        out[0] = low[0] - minTick


                if (pos[0] === -1)
                    if (out[0] <= high[0])
                        out[0] = high[0] + minTick
            }
        }
        return out
    }

    /** Returns seconds of a given timestamp
     * @param time - Time in ms (current t, if not defined)
     * @return Seconds
     */
    second(time?: number): number {
        return new Date(time || (se as any).t).getUTCSeconds()
    }

    /** Shortcut for Math.sign()
     * @param x The variable
     * @return Sign value
     */
    sign(x: number): number {
        return Math.sign(x)
    }

    /** Sine function
     * @param x The variable
     * @return Sine value
     */
    sin(x: number): number {
        return Math.sin(x)
    }

    /** Simple Moving Average
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    sma(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `sma(${len})`)
        let sum = 0
        for (var i = 0; i < len; i++) {
            sum = sum + src[i]
        }
        return this.ts(sum / len, id, src.__tf__)
    }

    /** Shortcut for Math.sqrt()
     * @param x The variable
     * @return Square root
     */
    sqrt(x: number): number {
        return Math.sqrt(x)
    }

    /** Standard deviation
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    stdev(src: TimeSeries, len: number, _id: string): TimeSeries {
        let sumf = (x: number, y: number) => {
            let res = x + y
            return res
        }

        let id = this._tsid(_id, `stdev(${len})`)
        let avg = this.sma(src, len, id)
        let sqd = 0
        for (var i = 0; i < len; i++) {
            let sum = sumf(src[i], -avg[0])
            sqd += sum * sum
        }
        return this.ts(Math.sqrt(sqd / len), id, src.__tf__)
    }

    /** Stochastic
     * @param src - Input
     * @param high - TS of high
     * @param low - TS of low
     * @param len - Length
     * @return New time-series
     */
    stoch(src: TimeSeries, high: TimeSeries, low: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `stoch(${len})`)
        let x = 100 * (src[0] - this.lowest(low, len, id + '1')[0])
        let y = this.highest(high, len, id + '2')[0] - this.lowest(low, len, id + '3')[0]
        return this.ts(x / y, id, src.__tf__)
    }

    /** Returns the sliding sum of last "len" values of the source
     * @param src - Input
     * @param len - Length
     * @return New time-series
     */
    sum(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `sum(${len})`)
        let sum = 0
        for (var i = 0; i < len; i++) {
            sum = sum + src[i]
        }
        return this.ts(sum, id, src.__tf__)
    }

    /** Supertrend Indicator
     * @param factor - ATR multiplier
     * @param atrlen - Length of ATR
     * @return Supertrend line and direction of trend
     */
    supertrend(factor: number, atrlen: number, _id: string, _tf?: number): TimeSeries[] {
        let id = this._tsid(_id, `supertrend(${factor},${atrlen})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let close = this.env.shared[`close${tfs}`]
        let hl2 = (high[0] + low[0]) * 0.5

        let atr = factor * this.atr(atrlen, id+'1', _tf)[0]

        let ls = this.ts(hl2 - atr, id+'2', _tf)
        let ls1 = this.nz(ls[1], ls[0])
        ls[0] = close[1] > ls1 ? Math.max(ls[0], ls1) : ls[0]

        let ss = this.ts(hl2 + atr, id+'3', _tf)
        let ss1 = this.nz(ss[1], ss)
        ss[0] = close[1] < ss1 ? Math.min(ss[0], ss1) : ss[0]

        let dir = this.ts(1, id+'4', _tf)
        dir[0] = this.nz(dir[1], dir[0])
        dir[0] = dir[0] === -1 && close[0] > ss1 ? 1 :
            (dir[0] === 1 && close[0] < ls1 ? -1 : dir[0])

        let plot = this.ts(dir[0] === 1 ? ls[0] : ss[0], id+'5', _tf)
        return [plot, this.neg(dir, id+'6')]
    }

    /** Symmetrically Weighted Moving Average
     * @param src - Input
     * @return New time-series
     */
    swma(src: TimeSeries, _id: string): TimeSeries {
        let id = this._tsid(_id, `swma`)
        let sum = src[3] * this.SWMA[0] + src[2] * this.SWMA[1] +
                  src[1] * this.SWMA[2] + src[0] * this.SWMA[3]
        return this.ts(sum, id, src.__tf__)
    }

    /** Creates a new Symbol.
     * @param x - Something, depends on arg variation
     * @param y - Something, depends on arg variation
     * @return Symbol instance
     * Argument variations:
     * data(Array), [params(Object)]
     * ts(TS), [params(Object)]
     * point(Number), [params(Object)]
     * tf(String) 1m, 5m, 1H, etc. (uses main OHLCV)
     * Params object: {
     *  id: String,
     *  tf: String|Number,
     *  aggtype: String (TODO: Type of aggregation)
     *  format: String (Data format, e.g. "time:price:vol")
     *  window: String|Number (Aggregation window)
     *  main true|false (Use as the main chart)
     * }
     */
    sym(x: any, y: any = {}, _id: string): Sym {
        let id = y.id || this._tsid(_id, `sym`)
        y.id = id
        if (this.env.syms[id]) {
            this.env.syms[id].update(x)
            return this.env.syms[id]
        }

        let sym: Sym
        switch(typeof x) {
            case 'object':
                sym = new Sym(x, y)
                this.env.syms[id] = sym
                if (x.__id__) {
                    sym.data_type = TSS
                } else {
                    sym.data_type = ARR
                }
                break
            case 'number':
                sym = new Sym(null, y)
                sym.data_type = NUM
                break
            case 'string':
                y.tf = x
                sym = new Sym((se as any).data.ohlcv.data, y)
                sym.data_type = ARR
                break
            default:
                throw new Error(`Invalid type for sym: ${typeof x}`)
        }

        this.env.syms[id] = sym
        return sym
    }

    /** Tangent function
     * @param x The variable
     * @return Tangent value
     */
    tan(x: number): number {
        return Math.tan(x)
    }

    time(res: any, sesh: any): void {
        // TODO: this
    }

    timestamp(): void {
        // TODO: this
    }

    /** True Range
     * @param fixnan - Fix NaN values
     * @return New time-series
     */
    tr(fixnan: boolean = false, _id: string, _tf?: number): TimeSeries {
        let id = this._tsid(_id, `tr(${fixnan})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let close = this.env.shared[`close${tfs}`]
        let res = 0
        if (this.na(close[1]) && fixnan) {
            res = high[0] - low[0]
        } else {
            res = Math.max(
                high[0] - low[0],
                Math.abs(high[0] - close[1]),
                Math.abs(low[0] - close[1])
            )
        }

        return this.ts(res, id, _tf)
    }

    /** True strength index
     * @param src - Input
     * @param short - Short length
     * @param long - Long length
     * @return New time-series
     */
    tsi(src: TimeSeries, short: number, long: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `tsi(${short},${long})`)
        let m = this.change(src, 1, id+'0')
        let m_abs = this.ts(Math.abs(m[0]), id+'1', src.__tf__)
        let tsi = (
            this.ema(this.ema(m, long, id+'1'), short, id+'2')[0] /
            this.ema(this.ema(m_abs, long, id+'3'), short, id+'4')[0]
        )
        return this.ts(tsi, id, src.__tf__)
    }

    variance(src: TimeSeries, len: number): void {
        // TODO: this
    }

    /** Create a new View
     * @param name - View name
     * @param props - View properties
     * @return View instance
     */
    view(name: string, props: any = {}, _id: string): View {
        if (!this.env.views[name]) {
            let view = new View(this, name, props)
            this.env.views[name] = view
            return view
        }
        return this.env.views[name]
    }

    vwap(src: TimeSeries): void {
        // TODO: this
    }

    /** Volume Weighted Moving Average
     * @param src - Input
     * @param len - length
     * @return New time-series
     */
    vwma(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `vwma(${len})`)
        let vol = this.env.shared.vol
        let sxv = this.ts(src[0] * vol![0], id+'1', src.__tf__)
        let res =
            this.sma(sxv, len, id+'2')[0] /
            this.sma(vol!, len, id+'3')[0]
        return this.ts(res, id+'4', src.__tf__)
    }

    /** Week of year, literally
     * @param time - Time in ms (current t, if not defined)
     * @return Week
     */
    weekofyear(time?: number): number {
        let date = new Date(time || (se as any).t)
        date.setUTCHours(0, 0, 0, 0)
        date.setDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7)
        let week1 = new Date(date.getUTCFullYear(), 0, 4)
        return 1 + Math.round(
            ((date.getTime() - week1.getTime()) / 86400000 - 3 +
            (week1.getUTCDay() + 6) % 7) / 7
        )
    }

    /** Weighted moving average
     * @param src - Input
     * @param len - length
     * @return New time-series
     */
    wma(src: TimeSeries, len: number, _id: string): TimeSeries {
        let id = this._tsid(_id, `wma(${len})`)
        let norm = 0
        let sum = 0
        for (var i = 0; i < len; i++) {
            let w = (len - i) * len
            norm += w
            sum += src[i] * w
        }
        return this.ts(sum / norm, id, src.__tf__)
    }

    /** Williams %R
     * @param len - length
     * @return New time-series
     */
    wpr(len: number, _id: string, _tf?: number): TimeSeries {
        let id = this._tsid(_id, `wpr(${len})`)
        let tfs = _tf || ''
        let high = this.env.shared[`high${tfs}`]
        let low = this.env.shared[`low${tfs}`]
        let close = this.env.shared[`close${tfs}`]

        let hh = this.highest(high, len, id)
        let ll = this.lowest(low, len, id)

        let res = (hh[0] - close[0]) / (hh[0] - ll[0])
        return this.ts(-res * 100 , id, _tf)
    }

    /** Year
     * @param time - Time in ms (current t, if not defined)
     * @return Year
     */
    year(time?: number): number {
        return new Date(time || (se as any).t).getUTCFullYear()
    }
}
