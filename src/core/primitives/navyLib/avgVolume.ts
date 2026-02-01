
// Average volume (SMA)

import { fastSma } from './helperFns'

interface Core {
    view: {
        i1: number
        i2: number
    }
    layout: {
        height: number
        indexBased?: boolean
        ti2x: (t: number, i: number) => number
    }
    data: number[][]
    dataSubset: number[][]
    props: {
        config: {
            VOLSCALE: number
        }
    }
}

interface Cnv {
    volScale: number
}

export default function avgVolume(
    ctx: CanvasRenderingContext2D,
    core: Core,
    props: { avgVolumeSMA: number; colorAvgVol: string },
    cnv: Cnv,
    vIndex: number = 5
): void {

    let i1 = core.view.i1
    let i2 = core.view.i2
    let len = props.avgVolumeSMA
    let sma = fastSma(core.data, vIndex, i1, i2, len)
    let layout = core.layout
    // let maxv = cnv.maxVolume // Currently unused
    let vs = cnv.volScale
    let h = layout.height
    // let h05 = core.props.config.VOLSCALE * 0.5 * h // Currently unused

    ctx.lineJoin = "round"
    ctx.lineWidth = 0.75
    ctx.strokeStyle = props.colorAvgVol
    ctx.beginPath()

    // TODO: implement
    if (core.layout.indexBased) return

    let offset = core.data.length - sma.length

    // TODO: Calculate layout index offset
    for (var i = 0, n = sma.length; i < n; i++) {
        let x = layout.ti2x(sma[i][0], i + offset)
        let y = h - sma[i][1] * vs
        ctx.lineTo(x, y)
    }
    ctx.stroke()

}
