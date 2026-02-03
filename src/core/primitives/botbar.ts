// Drawing botbar with CanvasJS

import Const from '../../stuff/constants'
import Utils from '../../stuff/utils'

const { MINUTE15, HOUR, DAY, WEEK, MONTH, YEAR, MONTHMAP, HPX } = Const

interface Props {
    config: {
        FONT: string
        PANHEIGHT: number
    }
    colors: {
        scale: string
        text: string
        textHL: string
        panel: string
    }
    timeFrame: number
    timezone: number
    cursor: {
        x: number
        time: number
    }
}

interface Layout {
    botbar: {
        width: number
        height: number
        xs: any[][]
    }
    main: {
        sbMax: number[]
    }
}

function body(props: Props, layout: Layout, ctx: CanvasRenderingContext2D) {
    if (!ctx) return // Guard against null context

    const width = layout.botbar.width
    const height = layout.botbar.height

    const sb0 = layout.main.sbMax[0]
    // const sb1 = layout.main.sbMax[1] // Currently unused

    ctx.font = props.config.FONT
    ctx.clearRect(0, 0, width, height)

    ctx.strokeStyle = props.colors.scale

    ctx.beginPath()
    ctx.moveTo(0, 0.5)
    ctx.lineTo(Math.floor(width + 1), 0.5)
    ctx.stroke()

    ctx.fillStyle = props.colors.text
    ctx.beginPath()

    type BotbarLabel = {
        index: number
        x: number
        lbl: string
        width: number
        priority: number
        left: number
        right: number
    }

    const labels: BotbarLabel[] = []
    const labelPadding = 6

    function labelPriority(tf: number) {
        if (tf === YEAR) return 4
        if (tf === MONTH) return 3
        if (tf === DAY) return 2
        return 1
    }

    for (let i = 0; i < layout.botbar.xs.length; i++) {
        const p = layout.botbar.xs[i]
        const lbl = String(formatDate(props, p))
        const x = p[0] + sb0
        const width = ctx.measureText(lbl).width
        const left = x - width * 0.5 - labelPadding
        const right = x + width * 0.5 + labelPadding
        labels.push({
            index: i,
            x,
            lbl,
            width,
            priority: labelPriority(p[2]),
            left,
            right
        })
    }

    const accepted: BotbarLabel[] = []
    for (const label of labels) {
        let keep = true
        while (accepted.length) {
            const last = accepted[accepted.length - 1]
            if (label.left > last.right) break
            if (label.priority > last.priority) {
                accepted.pop()
                continue
            }
            keep = false
            break
        }
        if (keep) accepted.push(label)
    }

    const acceptedIdx = new Set(accepted.map(label => label.index))

    for (let i = 0; i < layout.botbar.xs.length; i++) {
        const p = layout.botbar.xs[i]
        const x = p[0] + sb0
        //if (p[0] - sb0 > width - sb1) continue

        ctx.moveTo(x + HPX, 0)
        ctx.lineTo(x + HPX, 4.5)

        if (acceptedIdx.has(i)) {
            const lbl = labels[i].lbl
            if (!lblHighlight(props, p[1][0])) {
                ctx.globalAlpha = 0.85
            }
            ctx.textAlign = 'center'
            ctx.fillText(String(lbl), x, 18)
            ctx.globalAlpha = 1
        }
    }

    ctx.stroke()
}

function panel(props: Props, layout: Layout, ctx: CanvasRenderingContext2D) {
    if (!ctx) return // Guard against null context
    let lbl = formatCursorX(props)
    ctx.fillStyle = props.colors.panel

    let measure = ctx.measureText(lbl + '    ')
    let panwidth = Math.floor(measure.width + 10)
    let cursor = props.cursor.x + layout.main.sbMax[0]
    let x = Math.floor(cursor - panwidth * 0.5)
    let y = 1
    // TODO: limit panel movement
    //let w = layout.botbar.width - layout.main.sbMax[1]
    //x = Math.min(x, w - panwidth)
    let panheight = props.config.PANHEIGHT
    //ctx.fillRect(x, y, panwidth, panheight + 0.5)
    roundRect(ctx, x, y, panwidth, panheight + 0.5, 3)

    ctx.fillStyle = props.colors.textHL
    ctx.textAlign = 'center'
    ctx.fillText(String(lbl), cursor, y + 16)
}

function formatDate(props: Props, p: number[]) {
    let t = p[1]
    let tf = props.timeFrame

    // Enable timezones only for tf < 1D
    let k = tf < DAY ? 1 : 0
    let tZ = t + k * props.timezone * HOUR

    //t += new Date(t).getTimezoneOffset() * MINUTE
    let d = new Date(tZ)

    if (p[2] === YEAR || Utils.yearStart(t) === t) {
        return d.getUTCFullYear()
    }
    if (p[2] === MONTH || Utils.monthStart(t) === t) {
        return MONTHMAP[d.getUTCMonth()]
    }
    // TODO(*) see gridMaker.js
    if (Utils.dayStart(tZ) === tZ) return d.getUTCDate()

    let h = Utils.addZero(d.getUTCHours())
    let m = Utils.addZero(d.getUTCMinutes())
    return h + ':' + m
}

function formatCursorX(props: Props) {
    let t = props.cursor.time
    if (t === undefined) return `Out of range`
    // TODO: IMPLEMENT TI
    let tf = props.timeFrame
    // Enable timezones only for tf < 1D
    let k = tf < DAY ? 1 : 0

    //t += new Date(t).getTimezoneOffset() * MINUTE
    let d = new Date(t + k * props.timezone * HOUR)

    if (tf === YEAR) {
        return d.getUTCFullYear()
    }

    let yr: string = ''
    let mo: string = ''
    let dd: string = ''

    if (tf < YEAR) {
        yr = '\`' + `${d.getUTCFullYear()}`.slice(-2)
        mo = MONTHMAP[d.getUTCMonth()]
        dd = '01'
    }
    if (tf <= WEEK) dd = String(d.getUTCDate())
    let date = `${dd} ${mo} ${yr}`
    let time = ''

    if (tf < DAY) {
        let h = Utils.addZero(d.getUTCHours())
        let m = Utils.addZero(d.getUTCMinutes())
        time = h + ':' + m
    }

    return `${date}  ${time}`
}

// Highlights the begining of a time interval
// TODO: improve. Problem: let's say we have a new month,
// but if there is no grid line in place, there
// will be no month name on t-axis. Sad.
// Solution: manipulate the grid, skew it, you know
function lblHighlight(props: Props, t: number) {
    let tf = props.timeFrame

    if (t === 0) return true
    if (Utils.monthStart(t) === t) return true
    if (Utils.dayStart(t) === t) return true
    if (tf <= MINUTE15 && t % HOUR === 0) return true

    return false
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, 0)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, 0)
    ctx.closePath()
    ctx.fill()
}

export default {
    body,
    panel
}
