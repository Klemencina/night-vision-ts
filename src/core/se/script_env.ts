// Script environment. Packs everything that
// needed for a script execution together:
// script src, standart functions, input data,
// other overlays & dependencies

import ScriptStd, { TimeSeries } from './script_std'
import se from './script_engine'
import * as u from './script_utils'
import Pane from './pane'

const FDEFS1 = /(function |)([$A-Za-z_$][0-9A-Za-z_$.]*)[\s]*?\(([^)]*)\)/im
const FDEFS2 = /(function |)([$A-Za-z_$][0-9A-Za-z_$.]*)[\s]*?\(([^)]*)\)/gims
const DEF_LIMIT = 5

interface Script {
    uuid: string
    type: string
    code: {
        init: string
        update: string
        post: string
    }
    props?: { [key: string]: unknown }
    settings?: { [key: string]: unknown }
}

interface SharedData {
    open?: TimeSeries
    high?: TimeSeries
    low?: TimeSeries
    close?: TimeSeries
    vol?: TimeSeries
    dss: { [key: string]: { data: TimeSeries } }
    t: () => number
    iter: () => number
    tf?: number
    range?: [number, number]
    onclose?: boolean
    [key: string]: unknown
}

interface ScriptOutput {
    init?: () => void
    update?: () => void
    post?: () => void
    box_maker?: Function
}

export default class ScriptEnv {
    std: ScriptStd
    id: string
    src: Script
    output: ScriptOutput
    data: unknown[]
    tss: { [key: string]: TimeSeries }
    syms: { [key: string]: unknown }
    views: { [key: string]: unknown }
    shared: SharedData
    pane: Pane
    chart: { [key: string]: unknown }
    onchart: { [key: string]: unknown }
    offchart: { [key: string]: unknown }
    send_modify: (update: Record<string, unknown>) => void

    constructor(s: Script, data: SharedData) {
        this.std = (se as unknown as { std_inject(std: ScriptStd): ScriptStd }).std_inject(
            new ScriptStd(this)
        )
        this.id = s.uuid
        this.src = s
        this.output = {}
        this.data = []
        this.tss = {}
        this.syms = {}
        this.views = {}
        this.shared = data
        this.chart = {}
        this.onchart = {}
        this.offchart = {}
        this.send_modify = () => {}
        this.pane = new Pane(this)
    }

    build(): void {
        this.output.box_maker = this.make_box()
        this.output.box_maker(this, this.shared, se)
        delete this.output.box_maker
    }

    init(): void {
        this.output.init()
    }

    step(unshift = true): void {
        if (unshift) this.unshift()
        this.output.update()
        this.limit()
    }

    unshift(): void {
        for (var id in this.tss) {
            if (this.tss[id].__tf__) continue
            this.tss[id].unshift(undefined)
        }
    }

    limit(): void {
        for (var id in this.tss) {
            let ts = this.tss[id]
            ts.length = ts.__len__ || DEF_LIMIT
        }
    }

    make_box(): Function {
        let code = this.src.code
        let proto = Object.getPrototypeOf(this.std)
        let std = ``
        for (var k of Object.getOwnPropertyNames(proto)) {
            if (k === 'constructor') continue
            std += `const std_${k} = self.std.${k}.bind(self.std)\n`
        }

        let tss = ``
        for (var k in this.shared) {
            if (this.shared[k] && this.shared[k].__id__) {
                tss += `const ${k} = shared.${k}\n`
            }
        }

        let dss = ``

        try {
            let fn = Function(
                'self,shared,se',
                `
                'use strict';
                ${std}
                ${this.make_modules()}
                ${tss}
                const data = self.data
                const ohlcv = shared.dss.ohlcv.data
                ${dss}
                const $props = self.src.props
                const settings = self.src.settings
                const tf = shared.tf
                const range = shared.range
                const pane = self.pane

                this.init = (_id = 'root') => {
                    ${this.prep(code.init)}
                }

                this.update = (_id = 'root') => {
                    const t = shared.t()
                    const iter = shared.iter()
                    ${this.prep(code.update)}
                }

                this.post = (_id = 'root') => {
                    ${this.prep(code.post)}
                }
            `
            )
            return fn
        } catch (e) {
            console.error('[ScriptEnv] build failed for', this.src.type, e)
            return Function(
                'self,shared',
                `
                'use strict';
                this.init = () => {}
                this.update = () => {}
                this.post = () => {}
            `
            )
        }
    }

    make_modules(): string {
        let s = ``
        for (var id in (se as any).mods) {
            if (!(se as any).mods[id].api) continue
            s += `const ${id} = se.mods['${id}'].api[self.id]`
            s += '\n'
        }
        return s
    }

    prep(src: string): string {
        let h = this.src.type
        src = '\t\t  let _pref = \`\${_id}<-' + h + '<-\`\n' + src

        let call_id = 0
        interface ScriptLib {
            prefabs?: { [key: string]: unknown }
        }
        let prefabs = (self as unknown as { scriptLib?: ScriptLib }).scriptLib?.prefabs || {}

        let stdRes = this.replace_std_calls(src, call_id)
        src = stdRes.src
        call_id = stdRes.call_id

        let m: RegExpExecArray | null
        FDEFS2.lastIndex = 0
        do {
            m = FDEFS2.exec(src)
            if (m) {
                let fname = m[2]
                // Regex stops at first ); get full call (including nested parens) from source
                let rest = src.slice(m.index)
                let m0 = this.parentheses(rest)
                let i1 = m.index
                let i2 = m.index + m0.length
                let off = m.index + 1

                if (fname in prefabs) {
                    let utsid = `_pref+"f${++call_id}"`
                    let args = this.args2(m0)
                    let newStr = `pane.self.${fname}(${args}, ${utsid})`
                    src = this.replace(src, newStr, i1, i2)
                    off = i1 + newStr.length
                }

                FDEFS2.lastIndex = off
            }
        } while (m)

        let out = u.wrap_idxs(src, 'std_')
        return out
    }

    replace_std_calls(src: string, call_id: number): { src: string; call_id: number } {
        FDEFS2.lastIndex = 0
        let m: RegExpExecArray | null
        do {
            m = FDEFS2.exec(src)
            if (m) {
                let fname = m[2]
                // Regex stops at first ); get full call (including nested parens) from source
                let rest = src.slice(m.index)
                let m0 = this.parentheses(rest)
                let off = m.index + 1

                if (this.std[fname]) {
                    let [newSrc, replLen] = this.postfix(src, m, m0, ++call_id)
                    src = newSrc
                    off = m.index + replLen
                }

                FDEFS2.lastIndex = off
            }
        } while (m)

        return { src, call_id }
    }

    postfix(src: string, m: RegExpExecArray, m0: string, call_id: number): [string, number] {
        let target = this.get_args(this.fdef(m[2])).length
        let args = this.get_args_2(m0)
        for (var i = args.length; i < target; i++) {
            args.push('void 0')
        }
        args.push(`_pref+"f${call_id}"`)
        let repl = `std_${m[2]}(${args.join(', ')})`
        let i1 = m.index
        let i2 = m.index + m0.length
        return [this.replace(src, repl, i1, i2), m0.length]
    }

    replace(src: string, str: string, i1: number, i2: number): string {
        return [src.slice(0, i1), str, src.slice(i2)].join('')
    }

    parentheses(str: string): string {
        var count = 0,
            first = false
        for (var i = 0; i < str.length; i++) {
            if (str[i] === '(') {
                count++
                first = true
            } else if (str[i] === ')') {
                count--
            }
            if (first && count === 0) {
                return str.substr(0, i + 1)
            }
        }
        return str
    }

    args2(str: string): string {
        var count = 0,
            first = false
        var i1 = 0
        for (var i = 0; i < str.length; i++) {
            if (str[i] === '(') {
                count++
                if (!first) i1 = i + 1
                first = true
            } else if (str[i] === ')') {
                count--
            }
            if (first && count === 0) {
                return str.substring(i1, i)
            }
        }
        return str
    }

    fdef(fname: string): string {
        return this.std[fname].toString()
    }

    get_args(src: string): string[] {
        let reg = new RegExp(FDEFS1.source, 'mi')
        reg.lastIndex = 0

        let m = reg.exec(src)
        if (!m || !m[3].trim().length) return []
        return m[3]
            .split(',')
            .map(x => x.trim())
            .filter(x => x !== '_id' && x !== '_tf')
    }

    get_args_2(str: string): string[] {
        let args = this.args2(str)
        return args ? args.split(',').map(x => x.trim()) : []
    }

    regex_clone(reg: RegExp): RegExp {
        return new RegExp(reg.source, reg.flags)
    }
}
