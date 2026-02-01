
// Canvas context for text measurments

interface Props {
    config: {
        FONT: string
    }
}

function Context($p: Props): CanvasRenderingContext2D {

    let el = document.createElement('canvas')
    let ctx = el.getContext("2d")!
    ctx.font = $p.config.FONT

    return ctx

}

export default Context
