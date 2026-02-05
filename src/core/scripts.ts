// Scripts preprocessing/store
// TODO: ScriptHub - shared script storage
// (sharing prefabs b/w nvjs instances)

import Parser from '../core/navy/parser'
import WebWork from '../core/se/webWork'

const Overlays = (import.meta as any).glob('../scripts/*.navy', { eager: true })
const Tools = (import.meta as any).glob('../scripts/tools/*.navy', { eager: true })
const Indicators = (import.meta as any).glob('../scripts/indicators/*.navy', { eager: true })

interface Prefab {
    name: string
    author: string
    version: string
    ctx: string
    make: Function
    static: any
}

interface IScript {
    name: string
    author: string
    version: string
    code: {
        init: string
        update?: string
        post?: string
    }
    propsMeta?: { name: string; type: string; def: any }[]
}

class Scripts {
    ww: any
    srcLib: string[]
    prefabs: { [key: string]: Prefab }
    iScripts: { [key: string]: IScript }

    constructor(id: string) {
        this.ww = WebWork.instance(id, null)
        this.srcLib = []
        this.prefabs = {}
        this.iScripts = {}
    }

    async init(srcs: string[] = []): Promise<void> {
        this.srcLib = Object.values(Overlays).map(x => (x as any).default)
        this.srcLib.push(...Object.values(Tools).map(x => (x as any).default))
        this.srcLib.push(...Object.values(Indicators).map(x => (x as any).default))
        this.srcLib.push(...srcs)
        this.parse()

        await this.ww.exec('upload-scripts', {
            prefabs: Object.keys(this.prefabs).reduce((a: any, k) => {
                a[k] = {
                    name: this.prefabs[k].name,
                    author: this.prefabs[k].author,
                    version: this.prefabs[k].version
                }
                return a
            }, {}),
            iScripts: this.iScripts
        })
    }

    parse(): void {
        this.prefabs = {}
        for (var s of this.srcLib) {
            let parser = new Parser(s)
            for (var ov of parser.overlays) {
                this.prefabs[ov.tagProps.name] = {
                    name: ov.tagProps.name,
                    author: ov.tagProps.author,
                    version: ov.tagProps.version,
                    ctx: ov.tagProps.ctx || 'Canvas',
                    make: ov.prefab,
                    static: ov.static
                }
            }
            for (var ind of parser.indicators) {
                this.iScripts[ind.tagProps.name] = {
                    name: ind.tagProps.name,
                    author: ind.tagProps.author,
                    version: ind.tagProps.version,
                    code: {
                        init: ind.init,
                        update: ind.update,
                        post: ind.post
                    },
                    propsMeta: ind.propsMeta
                }
            }
        }
    }
}

let instances: { [id: string]: Scripts } = {}

function instance(id: string): Scripts {
    if (!instances[id]) {
        instances[id] = new Scripts(id)
    }
    return instances[id]
}

export { Scripts, instance }
export default { instance }
