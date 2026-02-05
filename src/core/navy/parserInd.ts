// Parser of [INDICATOR] section

import tools from './tools'

const SPLIT = /\[[\s]*?UPDATE[\s]*?\]|\[[\s]*?POST[\s]*?\]/gm
const UPDATE = /\[[\s]*?UPDATE[\s]*?\]([\s\S]*?)(\[POST|\[UPDATE|\[EOF)/gm
const POST = /\[[\s]*?POST[\s]*?\]([\s\S]*?)(\[POST|\[UPDATE|\[EOF)/gm
const PROP_REGEX = /prop\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]+)\}\s*\)/g

interface TagProps {
    [key: string]: string
}

export interface PropMeta {
    name: string
    type: string
    def: any
}

export default class ParserIND {
    tagProps: TagProps
    src: string
    init!: string
    update: string | undefined
    post: string | undefined
    propsMeta: PropMeta[]

    constructor(tagProps: string, src: string) {
        this.tagProps = this.parseTagProps(tagProps)
        this.src = src
        this.propsMeta = []

        this.parseBody()
        this.parseProps()
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

    parseProps(): void {
        // Extract prop() calls from init section
        const code = this.init || ''
        PROP_REGEX.lastIndex = 0
        let match

        while ((match = PROP_REGEX.exec(code)) !== null) {
            const name = match[1]
            const propsStr = match[2]

            // Parse the properties object
            const typeMatch = propsStr.match(/type\s*:\s*['"]([^'"]+)['"]/)
            const defMatch = propsStr.match(/def\s*:\s*([^,\s]+(?:\s*[\+\-]?\s*[^,\s]+)?)/)

            if (name) {
                let defValue: any = defMatch ? defMatch[1].trim() : undefined

                // Try to parse the default value
                if (defValue !== undefined) {
                    // Remove quotes if present
                    if (
                        (defValue.startsWith('"') && defValue.endsWith('"')) ||
                        (defValue.startsWith("'") && defValue.endsWith("'"))
                    ) {
                        defValue = defValue.slice(1, -1)
                    } else if (!isNaN(Number(defValue))) {
                        defValue = Number(defValue)
                    } else if (defValue === 'true') {
                        defValue = true
                    } else if (defValue === 'false') {
                        defValue = false
                    }
                }

                this.propsMeta.push({
                    name,
                    type: typeMatch ? typeMatch[1] : 'string',
                    def: defValue
                })
            }
        }
    }
}
