
// Calculations for candles & volume overlays
// DEPRECATED

// import Utils from '../../../stuff/utils'
import Const from '../../../stuff/constants'

const HPX = Const.HPX

interface Core {
    props: {
        config: {
            CANDLEW: number
            VOLSCALE: number
        }
        interval: number
    }
    data: number[][]
    layout: {
        time2x: (t: number) => number
        height: number
    }
    view: {
        i1: number
        i2: number
    }
}

interface CandleData {
    x: number
    w: number
    o: number
    h: number
    l: number
    c: number
    src: number[]
}

interface VolumeData {
    x1: number
    x2: number
    h: number
    green: boolean
    src: number[]
}

// Calulate positions & sizes for candles (if $c),
// volume bars (if $v), or both by default
export default function layoutCnv(
    core: Core,
    $c: boolean = true,
    $v: boolean = true
): { candles: CandleData[]; volume: VolumeData[] } {

    let config = core.props.config
    let interval = core.props.interval
    let data = core.data
    let time2x = core.layout.time2x
    let layout = core.layout
    let view = core.view
    let volIndex = 5 // Volume data index

    let candles: CandleData[] = []
    let volume: VolumeData[] = []

    // The volume bar height is determined as a percentage of
    // the chart's height (VOLSCALE)

    let maxv = 0
    let vs = 0
    let hasVolume = data.length > 0 && data[0].length > volIndex
    let showVolume = $v && hasVolume
    if (showVolume) {
        maxv = maxVolume(core.data, volIndex)
        vs = config.VOLSCALE * layout.height / maxv
    }
    var x1: number = 0, x2: number = 0, mid: number, prev: number | undefined = undefined
    let pxStep = (core.layout as any).pxStep
    let w = pxStep * config.CANDLEW

    let splitter = pxStep > 5 ? 1 : 0

    // A & B are current chart transformations:
    // A === scale,  B === Y-axis shift
    for (var i = view.i1, n = view.i2; i <= n; i++) {
        let p = data[i]
        mid = time2x(p[0]) + 1

        // Clear volume bar if there is a time gap
        if (data[i - 1] && p[0] - data[i - 1][0] > interval) {
            prev = undefined
        }

        // TODO: add log scale support
        if ($c) candles.push({
            x: mid,
            w: w,
            o: Math.floor(p[1]),
            h: Math.floor(p[2]),
            l: Math.floor(p[3]),
            c: Math.floor(p[4]),
            src: p
        })

        if (showVolume) {
            x1 = prev || Math.floor(mid - pxStep * 0.5)
            x2 = Math.floor(mid + pxStep * 0.5) + HPX
            volume.push({
                x1: x1,
                x2: x2,
                h: p[5] * vs,
                green: p[4] >= p[1],
                src: p
            })
        }

        prev = x2 + splitter
    }

    return { candles, volume }

}

function maxVolume(data: number[][], index: number): number {
    let max = 0
    for (var i = 0; i < data.length; i++) {
        let val = data[i][index]
        if (val > max) max = val
    }
    return max
}
