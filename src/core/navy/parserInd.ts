
// Parser of [INDICATOR] section

import tools from './tools'

const SPLIT = /\[[\s]*?UPDATE[\s]*?\]|\[[\s]*?POST[\s]*?\]/gm
const UPDATE = /\[[\s]*?UPDATE[\s]*?\]([\s\S]*?)(\[POST|\[UPDATE|\[EOF)/gm
const POST = /\[[\s]*?POST[\s]*?\]([\s\S]*?)(\[POST|\[UPDATE|\[EOF)/gm

interface TagProps {
    [key: string]: string
}

export default class ParserIND {
    tagProps: TagProps
    src: string
    init!: string
    update: string | undefined
    post: string | undefined

    constructor(tagProps: string, src: string) {
        this.tagProps = this.parseTagProps(tagProps)
        this.src = src

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
        SPLIT.lastIndex = 0
        UPDATE.lastIndex = 0
        POST.lastIndex = 0

        let code = tools.decomment(this.src)

        this.init = code.split(SPLIT)[0]
        code += '\n[EOF]'
        this.update = (UPDATE.exec(code) || [])[1]
        this.post = (POST.exec(code) || [])[1]
    }
}
