// Setup canvas element with DPI adjustment

import Utils from './utils'

type SetupResult = [HTMLCanvasElement | null, CanvasRenderingContext2D | null]

type CanvasMeta = {
    w: number
    h: number
    dpr: number
}

function applySize(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number
): void {
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    let pxW = Math.max(0, Math.floor(w * dpr))
    let pxH = Math.max(0, Math.floor(h * dpr))
    canvas.width = pxW
    canvas.height = pxH
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
}

function setup(id: string, w: number, h: number): SetupResult {
    let canvas = document.getElementById(id) as HTMLCanvasElement | null
    if (!canvas) {
        console.warn(`Canvas element #${id} not found, retrying...`)
        return [null, null]
    }
    let dpr = window.devicePixelRatio || 1
    if (dpr < 1) dpr = 1
    let ctx = canvas.getContext('2d', {})!
    applySize(canvas, ctx, w, h, dpr)
    ;(canvas as any).__nvjsDpr = { w, h, dpr } as CanvasMeta
    // Fallback fix for Brave browser
    // https://github.com/brave/brave-browser/issues/1738
    const ctxWithBackup = ctx as CanvasRenderingContext2D & {
        measureTextOrg?: typeof ctx.measureText
    }
    if (!ctxWithBackup.measureTextOrg) {
        ctxWithBackup.measureTextOrg = ctx.measureText
    }
    let nvjsId = id.split('-').shift() || ''
    ctx.measureText = text => Utils.measureText(ctx, text, nvjsId) as TextMetrics

    return [canvas, ctx]
}

function resize(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
): boolean {
    let dpr = window.devicePixelRatio || 1
    if (dpr < 1) dpr = 1
    let meta = (canvas as any).__nvjsDpr as CanvasMeta | undefined
    if (meta && meta.w === w && meta.h === h && meta.dpr === dpr) {
        return false
    }
    applySize(canvas, ctx, w, h, dpr)
    ;(canvas as any).__nvjsDpr = { w, h, dpr } as CanvasMeta
    return true
}

export default { setup, resize }
