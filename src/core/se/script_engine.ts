// Script engine

import ScriptEnv, { Script, SharedData } from './script_env'
import Utils from '../../stuff/utils'
import * as u from './script_utils'
import symstd from './symstd'
import TS from './script_ts'
import { TimeSeries } from './script_std'

const DEF_LIMIT = 5

interface DataSource {
    id: string
    data: TimeSeries | number[][]
    last_upd?: number
}

interface Mod {
    pre_run?: (sel: string[]) => void
    post_run?: (sel: string[]) => void
    pre_step?: (sel: string[]) => void
    post_step?: (sel: string[]) => void
    pre_env?: (id: string, script: Script) => void
    new_env?: (id: string, script: Script) => void
}

interface PaneStruct {
    id: string
    uuid: string
    scripts?: { uuid: string; settings?: { execOrder?: number } }[]
    overlays?: unknown[]
}

interface UpdateEvent {
    data: {
        id: string
    }
}

class ScriptEngine {
    map: { [key: string]: any }
    data: { [key: string]: DataSource }
    queue: unknown[]
    delta_queue: unknown[]
    update_queue: [TimeSeries[], UpdateEvent][]
    sett: { [key: string]: unknown }
    state: { [key: string]: unknown }
    mods: { [key: string]: Mod }
    std_plus: { [key: string]: Function }
    tf: number | undefined
    open!: TimeSeries
    high!: TimeSeries
    low!: TimeSeries
    close!: TimeSeries
    vol!: TimeSeries
    tss!: { [key: string]: TimeSeries }
    shared!: SharedData
    iter!: number
    t!: number
    skip!: boolean
    running!: boolean
    task!: string
    _restart!: boolean
    perf!: number
    data_size!: number
    range!: [number, number]
    custom_main: TimeSeries | null

    constructor() {
        this.map = {}
        this.data = {}
        this.queue = []
        this.delta_queue = []
        this.update_queue = []
        this.sett = {}
        this.state = {}
        this.mods = {}
        this.std_plus = {}
        this.tf = undefined
        this.custom_main = null
    }

    async exec_all(): Promise<void> {
        if (!this.data.ohlcv) {
            console.warn(
                '[ScriptEngine] exec_all: no this.data.ohlcv, skipping (upload-data may not have run)'
            )
            return
        }
        // Let current run() finish; don't overwrite map/paneStruct or we get "reading 'step' of undefined"
        if (this.running) return

        this.map = this.struct_to_map((self as any).paneStruct)

        const initResult = this.init_state()
        if (!initResult) return
        this.init_map()

        if (Object.keys(this.map).length) {
            await this.run()
            this.drain_queues()
        } else {
            this.send('overlay-data', this.format_data())
        }
        this.send_state()
    }

    async exec_sel(delta: any): Promise<void> {
        if (!this.data.ohlcv) return

        let sel = Object.keys(delta).filter(x => x in this.map)

        if (!this.init_state(sel)) {
            this.delta_queue.push(delta)
            return
        }

        for (var id in delta) {
            if (!this.map[id]) continue

            let props = this.map[id].src?.props || {}
            for (var k in props) {
                if (k in delta[id]) {
                    props[k].val = delta[id][k]
                }
            }

            this.add_script(this.map[id])
        }

        await this.run(sel)
        this.drain_queues()
        this.send_state()
    }

    add_script(s: any): void {
        let script = (self as any).scriptLib?.iScripts?.[s.type]
        if (!script) {
            delete this.map[s.uuid]
            return
        }

        try {
            s.code = {
                init: script.code?.init || '',
                update: script.code?.update || '',
                post: script.code?.post || ''
            }

            symstd.parse(s)

            for (var id in this.mods) {
                this.mods[id].pre_env?.(s.uuid, s)
            }

            s.env = new ScriptEnv(
                s,
                Object.assign(
                    this.shared,
                    {
                        open: this.open,
                        high: this.high,
                        low: this.low,
                        close: this.close,
                        vol: this.vol,
                        dss: this.data,
                        t: () => this.t,
                        iter: () => this.iter,
                        tf: this.tf,
                        range: this.range,
                        onclose: true
                    },
                    this.tss
                ) as SharedData
            )

            this.map[s.uuid] = s

            for (var id in this.mods) {
                this.mods[id].new_env?.(s.uuid, s)
            }

            s.env.build()
        } catch (err) {
            console.error('[ScriptEngine] add_script failed for', s.type, err)
            // Remove from map so run() skips this script; overlay-data still sent
            delete this.map[s.uuid]
        }
    }

    update(candles: any[], e: any): void {
        if (!this.data.ohlcv || !this.data.ohlcv.data?.length) {
            return this.send_update(e.data.id)
        }

        if (this.running) {
            this.update_queue.push([candles, e])
            return
        }

        if (!this.shared) return

        let mfs1 = this.make_mods_hooks('pre_step')
        let mfs2 = this.make_mods_hooks('post_step')

        let step = (sel: string[], unshift: boolean) => {
            for (var m = 0; m < mfs1.length; m++) {
                mfs1[m](sel)
            }

            for (var id of sel) {
                this.map[id].env?.step?.(unshift)
            }

            for (var m = 0; m < mfs2.length; m++) {
                mfs2[m](sel)
            }
        }

        try {
            let ohlcv = this.data.ohlcv.data as number[][]
            let i = ohlcv.length - 1
            let last = ohlcv[i] as number[]
            let sel = Object.keys(this.map)
            let unshift = false
            this.shared.event = 'update'

            for (var candle of candles) {
                if (candle[0] > last[0]) {
                    this.shared.onclose = true
                    step(sel, false)
                    ohlcv.push(candle)
                    unshift = true
                    i++
                } else if (candle[0] < last[0]) {
                    continue
                } else {
                    ohlcv[i] = candle
                }
            }

            this.iter = i
            this.t = ohlcv[i][0]
            this.step(ohlcv[i] as number[], unshift)

            this.shared.onclose = false
            step(sel, unshift)

            this.limit()
            this.send_update(e.data.id)
            this.send_state()
        } catch (err) {
            // Swallow update errors to avoid console spam
        }
    }

    init_state(sel?: string[]): boolean {
        sel = sel ?? Object.keys(this.map)
        let task = sel.join(',')

        if (this.running) {
            // Only restart when task changed (new scripts); same task = duplicate message, let current run() finish
            this._restart = task !== this.task
            return false
        }

        this.open = TS('open', [])
        this.high = TS('high', [])
        this.low = TS('low', [])
        this.close = TS('close', [])
        this.vol = TS('vol', [])

        this.tss = {}
        this.std_plus = {}
        this.shared = {} as SharedData

        this.iter = 0
        this.t = 0
        this.skip = false
        this.running = false
        this.task = task

        return true
    }

    struct_to_map(struct: any[]): { [key: string]: any } {
        let map: { [key: string]: any } = {}
        let list: any[] = []
        for (var pane of struct) {
            for (var s of pane.scripts || []) {
                list.push([s.uuid, s, s.settings?.execOrder ?? 1])
            }
        }
        list.sort((a, b) => a[2] - b[2])
        list.forEach(x => {
            map[x[0]] = x[1]
        })
        return map
    }

    std_inject(std: any): any {
        let proto = Object.getPrototypeOf(std)
        Object.assign(proto, this.std_plus)
        return std
    }

    send_state(): void {
        this.send('engine-state', {
            scripts: Object.keys(this.map).length,
            last_perf: this.perf,
            iter: this.iter,
            last_t: this.t,
            data_size: this.data_size,
            running: false
        })
    }

    send_update(taskId: string): void {
        this.send('overlay-update', this.format_update(), taskId)
    }

    init_map(): void {
        for (var id in this.map) {
            this.add_script(this.map[id])
        }
    }

    async run(sel?: string[]): Promise<void> {
        this.send('engine-state', { running: true })

        var t1 = Utils.now()
        sel = sel || Object.keys(this.map)

        this.pre_run_mods(sel)
        let mfs1 = this.make_mods_hooks('pre_step')
        let mfs2 = this.make_mods_hooks('post_step')

        this.running = true

        try {
            for (var id of sel) {
                this.map[id].env.init()
            }

            let ohlcv = this.data.ohlcv.data as number[][]
            let start = this.start(ohlcv)
            this.shared.event = 'step'

            for (var i = start; i < ohlcv.length; i++) {
                if (i % 5000 === 0) await Utils.pause(0)
                if (this.restarted()) {
                    return
                }

                this.iter = i - start
                this.t = ohlcv[i][0]
                this.step(ohlcv[i])
                this.shared.onclose = i !== ohlcv.length - 1

                for (var m = 0; m < mfs1.length; m++) {
                    mfs1[m](sel)
                }

                for (var id of sel) this.map[id].env?.step?.()

                for (var m = 0; m < mfs2.length; m++) {
                    mfs2[m](sel)
                }

                this.limit()
            }

            for (var id of sel) {
                this.map[id].env?.output?.post?.()
            }
        } catch (err) {
            console.error('[ScriptEngine] run failed:', err)
        }

        this.post_run_mods(sel)

        this.perf = Utils.now() - t1
        this.running = false

        this.send('overlay-data', this.format_data())
    }

    step(data: number[], unshift = true): void {
        if (unshift) {
            this.open.unshift(data[1])
            this.high.unshift(data[2])
            this.low.unshift(data[3])
            this.close.unshift(data[4])
            this.vol.unshift(data[5])
            for (var id in this.tss) {
                if (this.tss[id].__tf__) {
                    this.tss[id].__fn__?.(0)
                } else {
                    this.tss[id].unshift((this.tss[id].__fn__?.(0) as unknown as number) ?? 0)
                }
            }
        } else {
            this.open[0] = data[1]
            this.high[0] = data[2]
            this.low[0] = data[3]
            this.close[0] = data[4]
            this.vol[0] = data[5]
            for (var id in this.tss) {
                if (this.tss[id].__tf__) {
                    this.tss[id].__fn__?.(0)
                } else {
                    this.tss[id][0] = (this.tss[id].__fn__?.(0) as unknown as number) ?? 0
                }
            }
        }
    }

    limit(): void {
        this.open.length = this.open.__len__ || DEF_LIMIT
        this.high.length = this.high.__len__ || DEF_LIMIT
        this.low.length = this.low.__len__ || DEF_LIMIT
        this.close.length = this.close.__len__ || DEF_LIMIT
        this.vol.length = this.vol.__len__ || DEF_LIMIT
    }

    start(ohlcv: number[][]): number {
        let depth = this.sett.script_depth as number | undefined
        return depth ? Math.max(ohlcv.length - depth, 0) : 0
    }

    drain_queues(): void {
        if (this.queue.length) {
            this.exec_all()
        } else if (this.delta_queue.length) {
            this.exec_sel(this.delta_queue.pop())
            this.delta_queue = []
        } else {
            while (this.update_queue.length) {
                let upd = this.update_queue.shift()
                if (upd) this.update(upd[0], upd[1])
            }
        }
    }

    format_data(): any[] {
        const result = (self as any).paneStruct.map((x: any) => ({
            id: x.id,
            uuid: x.uuid,
            overlays: this.override_overlays(x.overlays || [])
        }))
        return result
    }

    override_overlays(ovs: any[]): any[] {
        for (var ov of ovs) {
            let s = this.map[ov.prod]
            if (!s) continue
            if (s.overlay) {
                ov = u.overrideOverlay(ov, s.overlay)
            }
        }
        return ovs
    }

    format_update(): { [key: string]: any } {
        let map: { [key: string]: any } = {}
        for (var pane of (self as any).paneStruct || []) {
            for (var ov of pane.overlays || []) {
                map[ov.uuid] = ov.data[ov.data.length - 1]
            }
        }
        return map
    }

    restarted(): boolean {
        if (this._restart) {
            this._restart = false
            this.running = false
            this.perf = 0
            return true
        }
        return false
    }

    remove_scripts(ids: string[]): void {
        for (var id of ids) delete this.map[id]
        this.send_state()
    }

    pre_run_mods(sel: string[]): void {
        for (var id in this.mods) {
            this.mods[id].pre_run?.(sel)
        }
    }

    post_run_mods(sel: string[]): void {
        for (var id in this.mods) {
            this.mods[id].post_run?.(sel)
        }
    }

    make_mods_hooks(name: keyof Mod): any[] {
        let arr: any[] = []
        for (var id in this.mods) {
            const mod = this.mods[id]
            const fn = mod[name]
            if (fn) arr.push(fn.bind(mod))
        }
        return arr
    }

    recalc_size(): void {
        while (true) {
            var sz = u.size_of_dss(this.data) / (1024 * 1024)
            let lim = this.sett.ww_ram_limit as number | undefined
            if (lim && sz > lim) {
                this.limit_size()
            } else break
        }
        this.data_size = +sz.toFixed(2)
        this.send_state()
    }

    limit_size(): void {
        let dss = Object.values(this.data).map(x => ({
            id: x.id,
            t: x.last_upd
        }))
        dss.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
        if (dss.length) {
            delete this.data[dss[0].id]
        }
    }

    send(type: string, data: any, taskId?: string): void {
        // Send to worker or main thread
    }
}

export default new ScriptEngine()
