// Script environment. Packs everything that
// needed for a script execution together:
// script src, standart functions, input data,
// other overlays & dependencies

import ScriptStd, { TimeSeries, ScriptEnv as StdScriptEnv } from './script_std'
import se from './script_engine'
import * as u from './script_utils'
import Pane from './pane'

const FDEFS1 = /(function |)([$A-Za-z_$][0-9A-Za-z_$.]*)[\s]*?\(([^)]*)\)/im
const FDEFS2 = /(function |)([$A-Za-z_$][0-9A-Za-z_$.]*)[\s]*?\(([^)]*)\)/gims
const DEF_LIMIT = 5

// Keep literal text out of call and history-index rewriting. Template expressions
// remain code, including expressions inside nested templates.
function protectLiterals(src: string): { code: string; restore: (code: string) => string } {
    let prefix = '__navy_literal_'
    while (src.includes(prefix)) prefix += '_'
    const literals: string[] = []
    let cursor = 0
    const save = (text: string): string => `${prefix}${literals.push(text) - 1}__`

    const quoted = (): string => {
        const start = cursor
        const quote = src[cursor++]
        while (cursor < src.length) {
            const char = src[cursor++]
            if (char === '\\') cursor++
            else if (char === quote) break
        }
        return save(src.slice(start, cursor))
    }

    const template = (): string => {
        let result = src[cursor++]
        let start = cursor
        while (cursor < src.length) {
            if (src[cursor] === '\\') {
                cursor += 2
            } else if (src[cursor] === '`') {
                result += save(src.slice(start, cursor)) + src[cursor++]
                return result
            } else if (src[cursor] === '$' && src[cursor + 1] === '{') {
                result += save(src.slice(start, cursor)) + '${'
                cursor += 2
                result += code(true)
                start = cursor
            } else {
                cursor++
            }
        }
        return result + save(src.slice(start, cursor))
    }

    const code = (expression = false): string => {
        let result = ''
        let depth = 0
        let canStartRegex = true
        let lastToken = ''
        const controlParens: boolean[] = []
        while (cursor < src.length) {
            const char = src[cursor]
            if (char === '"' || char === "'") {
                result += quoted()
                canStartRegex = false
                lastToken = ''
            } else if (char === '`') {
                result += template()
                canStartRegex = false
                lastToken = ''
            } else if (char === '/' && (src[cursor + 1] === '/' || src[cursor + 1] === '*')) {
                const start = cursor
                if (src[cursor + 1] === '/') {
                    while (cursor < src.length && src[cursor] !== '\n') cursor++
                } else {
                    const end = src.indexOf('*/', cursor + 2)
                    cursor = end < 0 ? src.length : end + 2
                }
                result += save(src.slice(start, cursor))
            } else if (char === '/' && canStartRegex) {
                const start = cursor++
                let characterClass = false
                while (cursor < src.length) {
                    const next = src[cursor++]
                    if (next === '\\') cursor++
                    else if (next === '[') characterClass = true
                    else if (next === ']') characterClass = false
                    else if (next === '/' && !characterClass) break
                }
                while (/[a-z]/i.test(src[cursor] || '') && cursor < src.length) cursor++
                result += save(src.slice(start, cursor))
                canStartRegex = false
                lastToken = ''
            } else if (/[$\w]/.test(char)) {
                const start = cursor++
                while (cursor < src.length && /[$\w]/.test(src[cursor])) cursor++
                const token = src.slice(start, cursor)
                result += token
                canStartRegex = /^(?:return|throw|case|delete|typeof|void|new|in|instanceof|yield|await)$/.test(token)
                lastToken = token
            }
            else {
                cursor++
                result += char
                if (char === '{') depth++
                if (char === '}' && expression && depth-- === 0) break
                if (!/\s/.test(char)) {
                    if ((char === '+' || char === '-') && src[cursor] === char) {
                        result += src[cursor++]
                    } else if (char === ')') {
                        canStartRegex = controlParens.pop() || false
                    } else {
                        if (char === '(') controlParens.push(/^(?:if|while|for|with|switch|catch)$/.test(lastToken))
                        canStartRegex = !/[\]}]/.test(char) && char !== '.'
                    }
                    lastToken = ''
                }
            }
        }
        return result
    }

    return {
        code: code(),
        restore: value => value.replace(new RegExp(`${prefix}(\\d+)__`, 'g'),
            (_match, index: string) => literals[Number(index)])
    }
}

interface Script {
    uuid: string
    type: string
    code: {
        init: string
        update: string
        post: string
    }
    props: { [key: string]: unknown }
    sett: { [key: string]: unknown }
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

export type { Script, SharedData }

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
            new ScriptStd(this as unknown as StdScriptEnv)
        )
        this.id = s.uuid
        this.src = s
        this.src.props = this.src.props || {}
        this.src.sett = this.src.sett || {}
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
        this.output.init?.()
    }

    step(unshift = true): void {
        if (unshift) this.unshift()
        this.output.update?.()
        this.limit()
    }

    unshift(): void {
        for (var id in this.tss) {
            if (this.tss[id].__tf__) continue
            this.tss[id].unshift(undefined as unknown as number)
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
            const ts = this.shared[k]
            if (ts && (ts as TimeSeries).__id__) {
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
                const settings = self.src.settings || self.src.sett || {}
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
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Cannot compile indicator "${this.src.type}": ${message}`, { cause: e })
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
        const literals = protectLiterals(src)
        src = literals.code
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
                } else if (fname.slice(0, 4) === 'pane') {
                    let last = fname.split('.').pop()
                    if (last && last in prefabs) {
                        let utsid = `_pref+"f${++call_id}"`
                        let args = this.args2(m0)
                        let newStr = `${fname}(${args}, ${utsid})`
                        src = this.replace(src, newStr, i1, i2)
                        off = i1 + newStr.length
                    }
                }

                FDEFS2.lastIndex = off
            }
        } while (m)

        let out = u.wrap_idxs(src, 'std_')
        return literals.restore(out)
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
                let off = m.index + m[0].indexOf('(')

                if ((this.std as unknown as Record<string, unknown>)[fname]) {
                    let [newSrc] = this.postfix(src, m, m0, ++call_id)
                    src = newSrc
                    off += 4 // 'std_'
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
        return ((this.std as unknown as Record<string, unknown>)[fname] as Function).toString()
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
        let parts: [number, number][] = []
        let c = 0
        let s = 0
        let q1 = false
        let q2 = false
        let q3 = false
        let part: [number, number] | null = null
        for (var i = 0; i < str.length; i++) {
            if (str[i] === '(') {
                c++
                if (!part) part = [i + 1, 0]
            }
            if (str[i] === ')') c--
            if (str[i] === '[') s++
            if (str[i] === ']') s--
            if (str[i] === "'" && !q2 && !q3) q1 = !q1
            if (str[i] === '"' && !q1 && !q3) q2 = !q2
            if (str[i] === '`' && !q1 && !q2) q3 = !q3
            if (str[i] === ',' && c === 1 && !s && !q1 && !q2 && !q3) {
                if (part) {
                    part[1] = i
                    parts.push(part)
                    part = [i + 1, 0]
                }
            }
            if (c === 0 && part) {
                part[1] = i
                parts.push(part)
                part = null
            }
        }
        return parts.map(x => str.slice(...x)).filter(x => /[^\s]+/.exec(x))
    }

    regex_clone(reg: RegExp): RegExp {
        return new RegExp(reg.source, reg.flags)
    }
}
