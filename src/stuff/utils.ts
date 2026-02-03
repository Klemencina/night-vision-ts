import IndexedArray from 'arrayslicer'
import Const from './constants'

const { MINUTE, MINUTE5, MINUTE15, HOUR, HOUR4, DAY, WEEK, MONTH, YEAR } = Const

// Type definitions for utility functions
export type TimeSeries = number[][]
export type Point = number[]
export type Pane = {
    overlays?: unknown[]
    uuid: string
}
export type Overlay = {
    main?: boolean
    type: string
    name?: string
    settings?: Record<string, unknown>
}

type IndexCache = {
    ia: any
    len: number
    last: number | undefined
}

const indexCache = new WeakMap<TimeSeries, IndexCache>()

function getIndex(arr: TimeSeries): any {
    let last = arr.length ? arr[arr.length - 1][0] : undefined
    let cached = indexCache.get(arr)
    if (!cached || cached.len !== arr.length || cached.last !== last) {
        cached = {
            ia: new (IndexedArray as any)(arr, '0'),
            len: arr.length,
            last
        }
        indexCache.set(arr, cached)
    }
    return cached.ia
}

// Window type with custom properties
declare global {
    interface Window {
        __counter__?: number
        __cpsId__?: ReturnType<typeof setTimeout> | null
        DocumentTouch?: unknown
    }
}

export default {
    clamp(num: number, min: number, max: number): number {
        return num <= min ? min : num >= max ? max : num
    },

    addZero(i: number): string {
        if (i < 10) {
            return '0' + i
        }
        return i.toString()
    },

    // Start of the day (zero millisecond)
    dayStart(t: number): number {
        let start = new Date(t)
        return start.setUTCHours(0, 0, 0, 0)
    },

    // Start of the month
    monthStart(t: number): number {
        let date = new Date(t)
        return Date.UTC(date.getFullYear(), date.getMonth(), 1)
    },

    // Start of the year
    yearStart(t: number): number {
        return Date.UTC(new Date(t).getFullYear())
    },

    getYear(t: number): number | undefined {
        if (!t) return undefined
        return new Date(t).getUTCFullYear()
    },

    getMonth(t: number): number | undefined {
        if (!t) return undefined
        return new Date(t).getUTCMonth()
    },

    // Nearest in array
    nearestA(x: number, array: number[]): [number, number | null] {
        let dist = Infinity
        let val: number | null = null
        let index = -1
        for (var i = 0; i < array.length; i++) {
            var xi = array[i]
            if (Math.abs(xi - x) < dist) {
                dist = Math.abs(xi - x)
                val = xi
                index = i
            }
        }
        return [index, val]
    },

    // Nearest value by time (in timeseries)
    nearestTs(t: number, ts: TimeSeries): [number, number[] | null] {
        let dist = Infinity
        let val: number[] | null = null
        let index = -1
        for (var i = 0; i < ts.length; i++) {
            var ti = ts[i][0]
            if (Math.abs(ti - t) < dist) {
                dist = Math.abs(ti - t)
                val = ts[i]
                index = i
            }
        }
        return [index, val]
    },

    // Nearest value by index (in timeseries)
    nearestTsIb(i: number, ts: TimeSeries, offset: number): [number, number[] | null] {
        let index = Math.floor(i - offset) + 1
        let val = ts[index] || null
        return [index, val]
    },

    round(num: number, decimals = 8): number {
        return parseFloat(num.toFixed(decimals))
    },

    // Strip? No, it's ugly floats in js
    strip(number: number | null | undefined): number | null {
        if (number == null) return null
        return parseFloat(parseFloat(number.toString()).toPrecision(12))
    },

    getDay(t: number): number | null {
        return t ? new Date(t).getDate() : null
    },

    // Update array keeping the same reference
    overwrite(arr: unknown[], new_arr: unknown[]): void {
        arr.splice(0, arr.length, ...new_arr)
    },

    // Get full list of overlays on all panes
    allOverlays(panes: Pane[] = []): unknown[] {
        return panes.map(x => x.overlays || []).flat()
    },

    // Detects a timeframe of the data
    detectTimeframe(data: TimeSeries): number {
        let len = Math.min(data.length - 1, 99)
        let min = Infinity
        data.slice(0, len).forEach((x, i) => {
            let d = data[i + 1][0] - x[0]
            if (d === d && d < min) min = d
        })
        // This saves monthly chart from being awkward
        if (min >= Const.MONTH && min <= Const.DAY * 30) {
            return Const.DAY * 31
        }
        return min
    },

    // Fast filter. Really fast, like 10X
    fastFilter(arr: TimeSeries, t1: number, t2: number): [TimeSeries, number | undefined] {
        if (!arr.length) return [arr, undefined]
        try {
            let ia = getIndex(arr)
            let res = ia.getRange(t1, t2)
            let i0 = ia.valpos[t1.toString()]?.next
            return [res, i0]
        } catch (e) {
            // Something wrong with fancy slice lib
            // Fast fix: fallback to filter
            return [arr.filter(x => x[0] >= t1 && x[0] <= t2), 0]
        }
    },

    // Fast filter 2 (returns indices)
    fastFilter2(arr: TimeSeries, t1: number, t2: number): [number | null, number] {
        if (!arr.length) return [0, arr.length]
        try {
            let ia = getIndex(arr)

            // fetch start and default to the next index above
            ia.fetch(t1)
            let start: number | null = ia.cursor ?? ia.nexthigh

            // fetch finish and default to the next index below
            ia.fetch(t2)
            let finish: number | null = ia.cursor ?? ia.nextlow

            return [start, (finish ?? 0) + 1]
        } catch (e) {
            // Something wrong with fancy slice lib
            // Fast fix: fallback to filter
            let subset = arr.filter(x => x[0] >= t1 && x[0] <= t2)
            let i1 = arr.indexOf(subset[0])
            let i2 = arr.indexOf(subset[subset.length - 1])

            return [i1, i2]
        }
    },

    // Fast filter (index-based)
    fastFilterIB(arr: TimeSeries, t1: number, t2: number): [number, number] {
        if (!arr.length) return [0, 0]
        let i1 = Math.floor(t1)
        if (i1 < 0) i1 = 0
        let i2 = Math.floor(t2 + 1)
        //let res = arr.slice(i1, i2)
        return [i1, i2]
    },

    // Nearest indexes (left and right)
    fastNearest(arr: TimeSeries, t1: number): [number | null, number | null] {
        try {
            let ia = getIndex(arr)
            ia.fetch(t1)
            return [ia.nextlow, ia.nexthigh]
        } catch (e) {
            let idx = this.nearestTs(t1, arr)[0]
            return [idx, idx]
        }
    },

    now(): number {
        return new Date().getTime()
    },

    pause(delay: number): Promise<void> {
        return new Promise(rs => setTimeout(rs, delay))
    },

    // Limit crazy wheel delta values
    smartWheel(delta: number): number {
        let abs = Math.abs(delta)
        if (abs > 500) {
            return (200 + Math.log(abs)) * Math.sign(delta)
        }
        return delta
    },

    // Parse the original mouse event to find deltaX
    getDeltaX(event: { originalEvent: { deltaX: number } }): number {
        return event.originalEvent.deltaX / 12
    },

    // Parse the original mouse event to find deltaY
    getDeltaY(event: { originalEvent: { deltaY: number } }): number {
        return event.originalEvent.deltaY / 12
    },

    // Apply opacity to a hex color
    applyOpacity(c: string, op: number): string {
        if (c.length === 7) {
            let n = Math.floor(op * 255)
            n = this.clamp(n, 0, 255)
            c += n.toString(16)
        }
        return c
    },

    // Parse timeframe or return value in ms
    parseTf(smth: string | number): number | undefined {
        if (typeof smth === 'string') {
            return Const.MAP_UNIT[smth]
        } else {
            return smth
        }
    },

    // Detect index shift between the main data subset
    // and the overlay's subset (for IB-mode)
    indexShift(sub: TimeSeries, data: TimeSeries): number {
        // Find the second timestamp (by value)
        if (!data.length) return 0
        let first = data[0][0]
        let second: number | undefined

        for (var i = 1; i < data.length; i++) {
            if (data[i][0] !== first) {
                second = data[i][0]
                break
            }
        }

        if (second === undefined) return 0

        for (var j = 0; j < sub.length; j++) {
            if (sub[j][0] === second) {
                return j - i
            }
        }

        return 0
    },

    // Fallback fix for Brave browser
    // https://github.com/brave/brave-browser/issues/1738
    measureText(
        ctx: CanvasRenderingContext2D & { measureTextOrg?: typeof ctx.measureText },
        text: string,
        nvId: string
    ): TextMetrics | { width: number } {
        let m = ctx.measureTextOrg ? ctx.measureTextOrg(text) : ctx.measureText(text)
        if (m.width === 0) {
            const doc = document
            const id = 'nvjs-measure-text'
            let el = doc.getElementById(id)
            if (!el) {
                let base = doc.getElementById(nvId)
                if (!base) return m
                el = doc.createElement('div')
                el.id = id
                el.style.position = 'absolute'
                el.style.top = '-1000px'
                base.appendChild(el)
            }
            if (ctx.font) el.style.font = ctx.font
            el.innerText = text.replace(/ /g, '.')
            return { width: el.offsetWidth }
        } else {
            return m
        }
    },

    uuid(temp = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'): string {
        return temp.replace(/[xy]/g, c => {
            var r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
        })
    },

    uuid2(): string {
        return this.uuid('xxxxxxxxxxxx')
    },

    uuid3(): string {
        return Math.random().toString().slice(2).replace(/^0+/, '')
    },

    // Delayed warning, f = condition lambda fn
    warn(f: () => boolean, text: string, delay = 0): void {
        setTimeout(() => {
            if (f()) console.warn(text)
        }, delay)
    },

    // Checks if it's time to make a script update
    // (based on execInterval in ms)
    delayedExec(v: {
        script?: { execInterval?: number }
        settings: { $last_exec?: number }
    }): boolean {
        if (!v.script || !v.script.execInterval) return true
        let t = this.now()
        let dt = v.script.execInterval
        if (!v.settings.$last_exec || t > v.settings.$last_exec + dt) {
            v.settings.$last_exec = t
            return true
        }
        return false
    },

    // Format names such 'RSI, $length', where
    // length - is one of the settings
    formatName(ov: { name?: string; settings?: Record<string, unknown> }): string | undefined {
        if (!ov.name) return undefined

        let name = ov.name

        for (var k in ov.settings || {}) {
            let val = ov.settings?.[k]
            let reg = new RegExp(`\\$${k}`, 'g')
            name = name.replace(reg, String(val))
        }

        return name
    },

    // Default cursor mode
    xMode(): string {
        return this.isMobile ? 'explore' : 'default'
    },

    defaultPrevented(event: {
        original?: { defaultPrevented: boolean }
        defaultPrevented: boolean
    }): boolean {
        if (event.original) {
            return event.original.defaultPrevented
        }
        return event.defaultPrevented
    },

    // Call
    afterAll(
        object: { __afterAllId__?: ReturnType<typeof setTimeout> },
        f: () => void,
        time: number
    ): void {
        clearTimeout(object.__afterAllId__)
        object.__afterAllId__ = setTimeout(() => f(), time)
    },

    // Default auto-precision sampler for a generic
    // timeseries-element: [time, x1, x2, x3, ...]
    defaultPreSampler(el: number[] | null): number[] {
        if (!el) return []
        let out: number[] = []
        for (var i = 1; i < el.length; i++) {
            if (typeof el[i] === 'number') {
                out.push(el[i])
            }
        }
        return out
    },

    // Get scales by side id (0 - left, 1 - right)
    getScalesBySide(
        side: number,
        layout: { settings?: { scaleTemplate?: number[][] }; scales?: Record<number, unknown> }
    ): unknown[] {
        if (!layout) return []
        let template = layout.settings?.scaleTemplate
        if (!template) return []
        return template[side].map(id => layout.scales?.[id]).filter(x => x) // Clean undefined
    },

    // If scaleTemplate is changed there could be a
    // situation when user forget to reset scaleSideIdxs.
    // Here we attemp to get them in sync
    autoScaleSideId(S: number, sides: number[][], idxs: (number | undefined)[]): void {
        if (sides[S].length) {
            if (!idxs[S] || !sides[S].includes(idxs[S] as number)) {
                idxs[S] = sides[S][0]
            }
        } else {
            idxs[S] = undefined
        }
    },

    // Debug function, shows how many times
    // this method is called per second
    callsPerSecond(): void {
        if (window.__counter__ === undefined) {
            window.__counter__ = 0
        }
        window.__counter__++
        if (window.__cpsId__) return
        window.__cpsId__ = setTimeout(() => {
            window.__counter__ = 0
            window.__cpsId__ = null
        }, 1000)
    },

    // Calculate an index offset for a timeseries
    // against the main ts. (for indexBased mode)
    findIndexOffset(mainTs: TimeSeries, ts: TimeSeries): number {
        let set1: Record<number, number> = {} // main set of time => index
        let set2: Record<number, number> = {} // another set
        for (var i = 0; i < mainTs.length; i++) {
            set1[mainTs[i][0]] = i
        }
        for (var i = 0; i < ts.length; i++) {
            set2[ts[i][0]] = i
        }
        let deltas: number[] = []
        for (var t in set2) {
            let time = parseInt(t)
            if (set1[time] !== undefined) {
                let d = set1[time] - set2[time]
                if (!deltas.length || deltas[0] === d) {
                    deltas.unshift(d)
                }
                // 3 equal deltas means that we likely found
                // the true index offset
                if (deltas.length === 3) {
                    return deltas.pop()!
                }
            }
        }
        return 0 // We didn't find the offset
    },

    // Format cash values
    formatCash(n: number | undefined): string {
        if (n == undefined) return 'x'
        if (typeof n !== 'number') return String(n)
        if (n < 1e3) return n.toFixed(0)
        if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(2) + 'K'
        if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(2) + 'M'
        if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(2) + 'B'
        if (n >= 1e12) return +(n / 1e12).toFixed(2) + 'T'
        return n.toString()
    },

    // Time range of a data subset (from i0 to iN-1)
    realTimeRange(data: TimeSeries): number {
        if (!data.length) return 0
        return data[data.length - 1][0] - data[0][0]
    },

    // Get sizes left and right parts of a number
    // (11.22 -> ['11', '22'])
    numberLR(x: number | null): [number, number] {
        var str = x != null ? x.toString() : ''
        let l: string, r: { length: number } | string
        if ((x as number) < 0.000001) {
            // Parsing the exponential form. Gosh this
            // smells trickily
            var [ls, rs] = str.split('e-')
            var [ls_part, rs_part] = ls.split('.')
            l = ls_part
            if (!rs_part) rs_part = ''
            r = { length: rs_part.length + parseInt(rs as string) || 0 }
        } else {
            var [l_part, r_part] = str.split('.')
            l = l_part
            r = r_part || ''
        }
        return [l.length, (r as string).length || (r as { length: number }).length]
    },

    // Get a hash of current overlay disposition:
    // pane1.uuid+ov1.type+ov2.type+...+pane2.uuid+...
    ovDispositionHash(
        panes: { uuid: string; overlays: { main?: boolean; type: string }[] }[]
    ): string {
        let h = ''
        for (var pane of panes) {
            h += pane.uuid
            for (var ov of pane.overlays) {
                if (ov.main) continue
                h += ov.type
            }
        }
        return h
    },

    // Format cursor event for the '$cursor-update' hook
    // TODO: doesn't work for renko
    makeCursorEvent(
        $cursor: Record<string, unknown>,
        cursor: { values?: unknown[]; ti?: number; time?: number },
        layout: {
            main?: {
                ohlc: (t: number) => number[] | null
                time2x: (ti: number) => number
                value2y: (x: number) => number
            }
        }
    ): Record<string, unknown> {
        $cursor.values = cursor.values
        $cursor.ti = cursor.ti
        $cursor.time = cursor.time
        $cursor.ohlcCoord = () => {
            let ohlc = layout.main?.ohlc(cursor.time!)
            return ohlc
                ? {
                      x: layout.main!.time2x(cursor.ti!),
                      ys: ohlc.map(x => layout.main!.value2y(x))
                  }
                : null
        }
        return $cursor
    },

    // Adjust mouse coords to fix the shift caused by
    // css transforms
    adjustMouse(event: MouseEvent, canvas: HTMLCanvasElement): MouseEvent {
        const rect = canvas.getBoundingClientRect()

        // Calculate the adjusted coordinates
        const adjustedX = event.clientX - rect.left
        const adjustedY = event.clientY - rect.top

        return new Proxy(event, {
            get(target, prop) {
                // Intercept access to layerX and layerY
                if (prop === 'layerX') {
                    return adjustedX
                } else if (prop === 'layerY') {
                    return adjustedY
                }

                // Ensure methods like preventDefault keep their original context
                if (typeof target[prop as keyof MouseEvent] === 'function') {
                    return (target[prop as keyof MouseEvent] as Function).bind(target)
                }

                // Default behavior for other properties
                return target[prop as keyof MouseEvent]
            }
        }) as MouseEvent
    },

    // GPT to the moon!
    getCandleTime(tf: number): string {
        const now = new Date(),
            h = now.getUTCHours(),
            m = now.getUTCMinutes(),
            s = now.getUTCSeconds(),
            Mo = now.getUTCMonth(),
            D = now.getUTCDay(),
            Y = now.getUTCFullYear()

        let rt: number

        switch (tf) {
            case MINUTE:
                rt = 60 - s
                return `00:${rt < 10 ? '0' : ''}${rt}`
            case MINUTE5:
                rt = 5 * 60 - (m % 5) * 60 - s
                return `${Math.floor(rt / 60)}:${rt % 60 < 10 ? '0' : ''}${rt % 60}`
            case MINUTE15:
                rt = 15 * 60 - (m % 15) * 60 - s
                return `${Math.floor(rt / 60)}:${rt % 60 < 10 ? '0' : ''}${rt % 60}`
            case HOUR:
                rt = 60 * 60 - m * 60 - s
                return (
                    `${(Math.floor((rt % 3600) / 60) + '').padStart(2, '0')}:` +
                    `${((rt % 60) + '').padStart(2, '0')}`
                )
            case HOUR4:
                rt = 4 * 60 * 60 - (h % 4) * 3600 - m * 60 - s
                const hours = Math.floor(rt / 3600)
                const minutes = Math.floor((rt % 3600) / 60)
                if (hours === 0) {
                    return `${minutes}:${((rt % 60) + '').padStart(2, '0')}`
                } else {
                    return `${hours}:${(minutes + '').padStart(2, '0')}:${((rt % 60) + '').padStart(2, '0')}`
                }
            case DAY:
                rt = 24 * 60 * 60 - h * 3600 - m * 60 - s
                return (
                    `${Math.floor(rt / 3600)}:` +
                    `${(Math.floor((rt % 3600) / 60) + '').padStart(2, '0')}:` +
                    `${((rt % 60) + '').padStart(2, '0')}`
                )
            case WEEK:
                rt = 7 * 24 * 60 * 60 - (D || 7) * 24 * 60 * 60 - h * 3600 - m * 60 - s
                return `${Math.floor(rt / (24 * 3600))}d ${Math.floor((rt % (24 * 3600)) / 3600)}h`
            case MONTH:
                const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), Mo + 1, 1))
                rt = (endOfMonth.getTime() - now.getTime()) / 1000
                return `${Math.floor(rt / (24 * 3600))}d ${Math.floor((rt % (24 * 3600)) / 3600)}h`
            case YEAR:
                const startOfYear = new Date(Date.UTC(Y, 0, 1))
                const endOfYear = new Date(Date.UTC(Y + 1, 0, 1))
                const totalSecondsInYear = (endOfYear.getTime() - startOfYear.getTime()) / 1000
                rt = totalSecondsInYear - (now.getTime() - startOfYear.getTime()) / 1000
                return `${Math.floor(rt / (24 * 3600))}d ${Math.floor((rt % (24 * 3600)) / 3600)}h`
            default:
                return 'Unk TF'
        }
    },

    // WTF with modern web development
    isMobile: (w =>
        'onorientationchange' in w &&
        (!!navigator.maxTouchPoints ||
            !!(navigator as Navigator & { msMaxTouchPoints?: number }).msMaxTouchPoints ||
            'ontouchstart' in w ||
            !!(w as Window & { DocumentTouch?: new () => Document }).DocumentTouch))(
        typeof window !== 'undefined' ? window : ({} as Window)
    )
}
