
// Parser of [OVERLAY] section

// TODO: add support of imports
// (imports functions from other .navy scripts)

// TODO: check overlay names collisions, when [export=true]

// TODO: way to define primitives, maybe with [PRIMITIVE] tag

// TODO: make preSampler & yRange function parsed before exec
// (they should be converted to use data from arguments)

import tools from './tools'

// Functions with brackets: fname() { }
const FREGX1 = /(function[\s]+|)([$A-Z_][0-9A-Z_$.]*)[\s]*?\(([^()]*)\)[\s]*?{/gmi
const FREGX2 = /(function[\s]+|)([$A-Z_][0-9A-Z_$.]*)[\s]*?\(([^()]*)\)[\s]*?=>[\s]*?{/gmi
const FREGX3 = /(function[\s]+|)([$A-Z_][0-9A-Z_$.]*)[\s]*?\(([^()]*)\)[\s]*?=>/gmi
const SREGX = /static\s+var\s+([a-zA-Z0-9_]+)\s*=/g

const KWORDS = ['if', 'for', 'while', 'switch', 'catch', 'with']

interface TagProps {
    [key: string]: string
}

export default class ParserOV {
    tagProps: TagProps
    src: string
    flags: string
    static!: Record<string, unknown>
    prefab!: Function

    constructor(tagProps: string, src: string) {
        this.tagProps = this.parseTagProps(tagProps)
        this.src = src
        this.flags = ''

        this.parseBody()
    }

    parseTagProps(src: string): TagProps {
        let obj: TagProps = {}
        let pairs = src.split(',')
        for (var p of pairs) {
            let [key, val] = p.split('=')
            obj[key.trim()] = val.trim()
        }
        return obj
    }

    parseBody(): void {
        let code = tools.decomment(this.src)
        code = this.prepFuncions1(code)
        code = this.prepFuncions2(code)
        code = this.prepFuncions3(code)
        
        let blocks = tools.extractStaticBlocks(code)
        this.static = this.wrapStatic(blocks) 
        
        code = this.renameStatic(code)
        this.prefab = this.wrapTheCode(code, this.flags)
    }

    prepFuncions1(code: string): string {
        let copy = ''
        let i = 0
        FREGX1.lastIndex = 0
        let m: RegExpExecArray | null
        do {
            m = FREGX1.exec(code)
            if (m) {
                let fname = m[2]
                let fargs = m[3]
                let open = FREGX1.lastIndex - 1
                let close = tools.findClosingBracket(code, open, 'script', '{}')

                if (!KWORDS.includes(fname)) {
                    let block = code.slice(open, close + 1)
                    copy += code.slice(i, m.index)
                    copy += `var ${fname} = (${fargs}) => ${block}`
                    this.parseFlags(fname, fargs, block)
                } else {
                    copy += code.slice(i, close+1)
                }

                FREGX1.lastIndex = close
                i = close + 1
            }
        } while (m)
        return copy + code.slice(i)
    }

    prepFuncions2(code: string): string {
        let copy = ''
        let i = 0
        FREGX2.lastIndex = 0
        let m: RegExpExecArray | null
        do {
            m = FREGX2.exec(code)
            if (m) {
                let fname = m[2]
                let fargs = m[3]
                let open = FREGX2.lastIndex - 1
                let close = tools.findClosingBracket(code, open, 'script', '{}')

                if (!KWORDS.includes(fname)) {
                    let block = code.slice(open, close + 1)
                    copy += code.slice(i, m.index)
                    copy += `var ${fname} = (${fargs}) => (${block})`
                    this.parseFlags(fname, fargs, block)
                } else {
                    copy += code.slice(i, close+1)
                }

                FREGX2.lastIndex = close
                i = close + 1
            }
        } while (m)
        return copy + code.slice(i)
    }

    prepFuncions3(code: string): string {
        let copy = ''
        let i = 0
        FREGX3.lastIndex = 0
        let m: RegExpExecArray | null
        do {
            m = FREGX3.exec(code)
            if (m) {
                let fname = m[2]
                let fargs = m[3]
                let arrow = FREGX3.lastIndex

                copy += code.slice(i, m.index)
                copy += `var ${fname} = (${fargs}) => `
                let block = code.slice(arrow).split('\n')[0].trim()
                this.parseFlags(fname, fargs, block)

                i = arrow + 1
            }
        } while (m)
        return copy + code.slice(i)
    }

    parseFlags(name: string, fargs: string, block: string): void {
        if (name === 'yRange') {
            let x = fargs.trim().split(',').length > 1
            this.flags += `yRangePreCalc: ${x},\n`
        } else if (name === 'legend') {
            if (block === 'null' || block === 'undefined') {
                this.flags += `noLegend: true,\n`
            }
        }
    }

    wrapStatic(code: string): Record<string, unknown> {
        let renamed = code.replace(SREGX, '$static.$1 =');
        const wrappedScript = `
            var $static = {}
            ${renamed}
            return $static
        `;
        try {
            const dynamicFunction = new Function(wrappedScript);
            const result = dynamicFunction();
            return result
        } catch (error) {
            console.error("Error parsing static functions", error);
        }
        return {}
    }

    renameStatic(code: string): string {
        return code.replace(SREGX, '$static.$1 =')
    }

    wrapTheCode(code: string, flags: string): Function {
        return new Function('env', `
            let { $core, $props, $events } = env
            let prop = (...args) => env.prop(...args)
            let watchProp = (...args) => env.watchProp(...args)
            let $static = {} 
            let $lib = env.lib

            var init = () => {}
            var destroy = () => {}
            var meta = () => null
            var dataFormat = () => null
            var draw = () => {}
            var drawSidebar = null
            var drawBotbar = null
            var yRange = null
            var preSampler = null
            var legend = null
            var legendHtml = null
            var valueTracker = null
            var ohlc = null

            var mousemove = null
            var mouseout = null
            var mouseup = null
            var mousedown = null
            var click = null
            var keyup = null
            var keydown = null
            var keypress = null

            ${code}

            return {
                gridId: () => $core.layout.id,
                id: () => $core.id,
                init, destroy, meta, dataFormat,
                draw, drawSidebar, drawBotbar,
                yRange, preSampler,
                legend, legendHtml,
                valueTracker, ohlc,
                mousemove, mouseout, mouseup,
                mousedown, click, keyup, keydown,
                keypress,
                ${flags}
            }
        `);
    }
}
