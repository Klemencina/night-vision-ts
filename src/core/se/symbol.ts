// Symbol (contains several samplers, e.g. high, low, close...)

import * as u from './script_utils'
import se from './script_engine'
import TS from './script_ts'
import type { TimeSeries } from './script_ts'
import Sampler from './sampler'

const OHLCV = ['open', 'high', 'low', 'close', 'vol']

export const ARR = 0
export const TSS = 1
export const NUM = 2

interface SymParams {
    id: string
    tf?: string | number
    format?: string
    aggtype?: string | Function
    window?: string | number
    fillgaps?: boolean
    main?: boolean
}

interface DataIndex {
    [key: string]: number
    time: number
    open: number
    high: number
    low: number
    close: number
    vol: number
}

export default class Sym {
    id: string
    tf!: number
    format?: string
    aggtype: string | Function
    window?: number
    fillgaps?: boolean
    data: any[] | TimeSeries
    data_type: number
    main: boolean
    idx: DataIndex
    tmap: Record<number, number>

    open!: TimeSeries
    high!: TimeSeries
    low!: TimeSeries
    close!: TimeSeries
    vol!: TimeSeries

    __t0__?: number

    constructor(data: any[] | TimeSeries | null, params: SymParams) {
        this.id = params.id
        this.tf = u.tf_from_str(params.tf as string) as number
        this.format = params.format
        this.aggtype = params.aggtype || 'ohlcv'
        this.window = u.tf_from_str(params.window as string) as number
        this.fillgaps = params.fillgaps
        this.data = data || []
        this.data_type = ARR
        this.main = !!params.main
        this.idx = this.data_idx()
        this.tmap = {}

        this.tf = this.tf || se.tf!
        if (this.main) this.tf = se.tf!

        // Create a bunch of OHLCV samplers for
        // sparse data
        if (this.aggtype === 'ohlcv') {
            for (var id of OHLCV) {
                ;(this as any)[id] = TS(`${this.id}_${id}`, [])
                ;(this as any)[id].__fn__ = Sampler(id).bind((this as any)[id])
                ;(this as any)[id].__tf__ = this.tf
            }
        }

        // Create regular TSs & just feed them with a
        // data points from the dataset
        // TODO: different TS configurations depending
        // on this.format
        if (this.aggtype === 'copy') {
            for (var id of OHLCV) {
                ;(this as any)[id] = TS(`${this.id}_${id}`, [])
                ;(this as any)[id].__tf__ = this.tf
            }
            for (var i = 0; i < (this.data as any[]).length; i++) {
                this.tmap[(this.data as any[])[i][0]] = i
            }
        }
        // Custom agg function (value calculated for the
        // current window)
        if (typeof this.aggtype === 'function') {
            this.close = TS(`${this.id}_close`, [])
            this.close.__fn__ = this.aggtype as (x: number, t?: number) => void
            this.close.__tf__ = this.tf
        }

        if (this.main) {
            if (!this.tf) throw 'Main tf should be defined'
            se.custom_main = this as unknown as TimeSeries
            let t0 = (this.data as any[])[0][0]
            se.t = t0 - (t0 % this.tf)
            this.update(null, se.t)

            // First candle should be formed before any updates()
            const ohlcv = se.data.ohlcv.data as number[][]
            ohlcv.length = 0
            ohlcv.push([se.t, this.open[0], this.high[0], this.low[0], this.close[0], this.vol[0]])
        }
    }

    update(x: any, t?: number): boolean {
        if (this.aggtype === 'ohlcv') {
            return this.update_ohlcv(x, t)
        } else if (this.aggtype === 'copy') {
            return this.update_copy(x, t)
        } else if (typeof this.aggtype === 'function') {
            return this.update_custom(x, t)
        }
        return false
    }

    update_ohlcv(x: any, t?: number): boolean {
        // Timestamp of the target candle, can be
        // current or the next (if we are sampling
        // the main chart)
        t = t || se.t
        let idx = this.idx
        switch (this.data_type) {
            case ARR:
                if (t > (this.data as any[])[(this.data as any[]).length - 1][0]) return false
                let t0 = this.window ? t - this.window + this.tf : t
                let dt = t0 % this.tf
                t0 -= dt
                let i0 = u.nextt(this.data as any[][], t0)
                if (i0 >= (this.data as any[]).length) return false
                let t1 = t + se.tf!
                // Flush volume before the next window,
                // but not before a new candle
                if (t < (this.vol.__t0__ || 0) + this.tf) this.vol[0] = 0
                let noevent = true
                for (var i = i0; i < (this.data as any[]).length; i++) {
                    noevent = false
                    let dp = (this.data as any[])[i]
                    if (dp[idx.time] >= t1) break
                    this.open.__fn__!(dp[idx.open], t)
                    this.high.__fn__!(dp[idx.high], t)
                    this.low.__fn__!(dp[idx.low], t)
                    this.close.__fn__!(dp[idx.close], t)
                    this.vol.__fn__!(dp[idx.vol], t)
                }
                if (noevent) {
                    if (this.fillgaps === false && !this.main) return false
                    let last = this.close[0]
                    this.open.__fn__!(last, t)
                    this.high.__fn__!(last, t)
                    this.low.__fn__!(last, t)
                    this.close.__fn__!(last, t)
                    this.vol.__fn__!(0, t)
                }
                break
            case TSS:
                // TODO: this
                break
            case NUM:
                // TODO: this
                break
        }
        return true
    }

    update_copy(x: any, t?: number): boolean {
        t = t || se.t

        // Assuming that we got an ohlcv dataset
        let i = this.tmap[t!]
        let s = (this.data as any[])[i]

        let ts0 = this.__t0__
        if (!ts0 || t! >= ts0 + this.tf) {
            for (var k = 0; k < 5; k++) {
                let tsn = OHLCV[k]
                ;(this as any)[tsn].unshift(undefined)
            }
            this.__t0__ = t! - (t! % this.tf)
            let last = (this.data as any[]).length - 1
            if (this.__t0__ === (this.data as any[])[last][0]) {
                this.tmap[this.__t0__] = last
                s = (this.data as any[])[last]
            }
        }

        if (s) {
            for (var k = 0; k < 5; k++) {
                let tsn = OHLCV[k]
                ;(this as any)[tsn][0] = s[k + 1]
            }
        } else if (this.fillgaps) {
            for (var k = 0; k < 5; k++) {
                let tsn = OHLCV[k]
                ;(this as any)[tsn][0] = this.close[1]
            }
        }
        return true
    }

    update_custom(x: any, t?: number): boolean {
        t = t || se.t
        let idx = this.idx
        switch (this.data_type) {
            case ARR:
                if (!(this.data as any[]).length) return false
                if (t! > (this.data as any[])[(this.data as any[]).length - 1][0]) return false
                let t0 = this.window ? t! - this.window + this.tf : t!
                let dt = t0 % this.tf
                t0 -= dt
                let i0 = u.nextt(this.data as any[][], t0)
                if (i0 >= (this.data as any[]).length) return false
                let t1 = t! + se.tf!

                let sub: any[] = []
                for (var i = i0; i < (this.data as any[]).length; i++) {
                    let dp = (this.data as any[])[i]
                    if (dp[idx.time] >= t1) break
                    sub.push(dp)
                }

                let val: any
                if (sub.length || this.fillgaps === false) {
                    val = (this.close.__fn__ as Function)(sub) // TODO: prob a bug
                } else if (this.fillgaps) {
                    val = this.close[0]
                }
                let ts0 = this.close.__t0__
                if (!ts0 || t! >= ts0 + this.tf) {
                    this.close.unshift(val)
                    this.close.__t0__ = t! - (t! % this.tf)
                } else {
                    this.close[0] = val
                }
                break
            case TSS:
                // TODO: this
                break
            case NUM:
                // TODO: this
                break
        }
        return true
    }

    // Calculates data indices from the format
    data_idx(): DataIndex {
        let idx: Partial<DataIndex> = {}
        switch (this.aggtype) {
            case 'ohlcv':
                // Trying to detect the format from the
                // first data point
                if (!this.format) {
                    let x0 = (this.data as any[])[0]
                    if (!x0 || x0.length === 6) {
                        this.format = 'time:open:high:low:close:vol'
                    } else if (x0.length === 3) {
                        this.format = 'time:open,high,low,close:vol'
                    }
                }
                break
            default:
                this.format = 'time:close'
                break
        }
        this.format!.split(':').forEach((x, i) => {
            if (!x.length) return
            let list = x.split(',')
            list.forEach(y => ((idx as any)[y] = i))
        })
        return idx as DataIndex
    }
}

export { Sym }
