

export default function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number | { tl: number; tr: number; br: number; bl: number },
    fill: boolean = true,
    stroke?: boolean
): void {
    if (typeof radius === 'undefined') {
        radius = 5;
    }
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (var side in defaultRadius) {
            (radius as any)[side] = (radius as any)[side] || (defaultRadius as any)[side];
        }
    }
    ctx.beginPath();
    ctx.moveTo(x + (radius as any).tl, y);
    ctx.lineTo(x + width - (radius as any).tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + (radius as any).tr);
    ctx.lineTo(x + width, y + height - (radius as any).br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - (radius as any).br, y + height);
    ctx.lineTo(x + (radius as any).bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - (radius as any).bl);
    ctx.lineTo(x, y + (radius as any).tl);
    ctx.quadraticCurveTo(x, y, x + (radius as any).tl, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}