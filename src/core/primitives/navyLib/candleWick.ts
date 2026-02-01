
// Drawing candle body seperately (for speed-up)

export default function candleWick(
    ctx: CanvasRenderingContext2D,
    data: {
        x: number
        h: number
        l: number
    }
): void {
    let x05 = data.x - 1

    ctx.moveTo(x05, Math.floor(data.h))
    ctx.lineTo(x05, Math.floor(data.l))
}
