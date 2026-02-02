// Layout functional interface

import Utils from '../stuff/utils'
import Const from '../stuff/constants'
import math from '../stuff/math'

const HPX = Const.HPX

interface Overlay {
    indexOffset?: number
}

interface LayoutSelf {
    spacex: number
    A: number
    B: number
    scaleSpecs?: {
        log?: boolean
    }
    indexBased: boolean
    candles?: any[]
    master_grid?: {
        candles: any[]
    }
    tiMap?: {
        smth2i: (t: number) => number
    }
    ti: (t: number, i: number) => number
    ti2x: (t: number, i: number) => number
    time2x: (t: number) => number
    value2y: (y: number) => number
    tMagnet: () => void
    y2value: (y: number) => number
    x2time: (x: number) => number
    x2ti: (x: number) => number
    $magnet: () => void
    cMagnet: (t: number) => any
    dataMagnet: () => void
}

// If `overlay` provided, that means this is an
// overlay-specific layout-api
export default function(self: LayoutSelf, range: [number, number], overlay: Overlay | null = null): LayoutSelf {

    //const ib = self.tiMap.ib
    const dt = range[1] - range[0]
    const r = self.spacex / dt
    const ls = (self.scaleSpecs || {}).log || false // TODO: from scale specs
    const offset = (overlay ? overlay.indexOffset : 0) ?? 0

    Object.assign(self, {
        // Time and global index to screen x-coordinate
        // (universal mapping that works both in timeBased
        // & indexBased modes):

        // Time-index switch (returns time or index depending on the mode)
        ti: (t: number, i: number): number => {
            return self.indexBased ? i : t
        },
        // Time-or-index to screen x-coordinate
        ti2x: (t: number, i: number): number => {
            let src = self.indexBased ? (i + offset) : t
            return Math.floor((src - range[0]) * r) + HPX
        },
        // Time to screen x-coordinates
        time2x: (t: number): number => {
            return Math.floor((t - range[0]) * r) + HPX
        },
        // Price/value to screen y-coordinates
        value2y: (y: number): number => {
            if (ls) y = math.log(y)
            return Math.floor(y * self.A + self.B) + HPX
        },
        // Time-axis nearest step
        tMagnet: (): void => {
            // TODO: reimplement
            //if (ib) t = self.tiMap.smth2i(t)
            /*const cn = self.candles || self.master_grid.candles
            const arr = cn.map(x => x.raw[0])
            const i = Utils.nearestA(t, arr)[0]
            if (!cn[i]) return
            return Math.floor(cn[i].x) + HPX */
        },
        // Screen-Y to dollar value (or whatever)
        y2value: (y: number): number => {
            if (ls) return math.exp((y - self.B) / self.A)
            return (y - self.B) / self.A
        },
        // Screen-X to timestamp
        x2time: (x: number): number => {
            // return Math.floor(range[0] + x / r)
            return range[0] + x / r
        },
        // Screen-X to time-index
        x2ti: (x: number): number => {
            // TODO: implement
            return range[0] + x / r
        },
        // $-axis nearest step
        $magnet: (): void => { },
        // Nearest candlestick
        cMagnet: (t: number): any => {
            const cn = self.candles || self.master_grid!.candles
            const arr = cn.map((x: any) => x.raw[0])
            const i = Utils.nearestA(t, arr)[0]
            return cn[i]
        },
        // Nearest data points
        dataMagnet: (): void => {  /* TODO: implement */ }
    })

    return self

}
