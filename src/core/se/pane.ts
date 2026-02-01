
// Pane interface for drawing overlays from scripts

import se from './script_engine'
import * as u from './script_utils'
import Utils from '../../stuff/utils'
import type ScriptEnv from './script_env'

interface PaneStruct {
    uuid: string
    scripts: { uuid: string }[]
    overlays?: any[]
}

interface OverlaySpecs {
    name?: string
    settings?: Record<string, any>
    props?: Record<string, any>
}

export default class Pane {
    scriptId: string
    env: ScriptEnv
    selfId: string | undefined
    paneMap: Record<string, PaneStruct>
    name2ov: Record<string, any>
    self: Record<string, Function>

    constructor(env: ScriptEnv) {
        this.scriptId = env.id
        this.env = env
        this.selfId = this.findSelfId(env.id)
        this.paneMap = this.createMap()
        this.name2ov = {}
        this.self = this.paneLib(this.selfId!)
    }

    // Create a virtual pane with all overlays, so
    // we can call, e.g.: pane.self.<OverlayType>(...)
    paneLib(uuid: string): Record<string, Function> {
        let lib: Record<string, Function> = {}
        const scriptLib = (self as any).scriptLib
        for (var k in scriptLib?.prefabs || {}) {
            lib[k] = ((type: string) => {
                return (v: any, specs: OverlaySpecs | string, _id?: string) => {
                    const id = _id ?? (typeof specs === 'string' ? specs : undefined)
                    if (!id) throw new Error('Missing id for overlay')
                    let name = u.get_fn_id(type, id)
                    if (!this.name2ov[name]) {
                        let pane = this.paneMap[uuid]
                        if (!pane) pane = this.createPane()
                        this.name2ov[name] = this.newOverlay(
                            pane, name, type, typeof specs === 'string' ? {} : specs
                        )
                    }
                    let ov = this.name2ov[name]
                    this.addNewValue(ov, v)
                }
            })(k)
        }
        return lib
    }

    // Create {pane.uuid => pane} map
    createMap(): Record<string, PaneStruct> {
        let map: Record<string, PaneStruct> = {}
        const paneStruct: PaneStruct[] = (self as any).paneStruct || []
        for (var pane of paneStruct) {
            map[pane.uuid] = pane
        }
        return map
    }

    // Find pane.self id
    findSelfId(id: string): string | undefined {
        const paneStruct: PaneStruct[] = (self as any).paneStruct || []
        for (var pane of paneStruct) {
            for (var script of pane.scripts) {
                if (script.uuid === id) {
                    return pane.uuid
                }
            }
        }
        return undefined
    }

    // Add a new overlay to the struct
    newOverlay(pane: PaneStruct, name: string, type: string, specs: OverlaySpecs): any {
        if (!pane.overlays) pane.overlays = []
        let ov = {
            name: specs.name ?? name,
            type: type,
            settings: specs.settings ?? {},
            props: specs.props ?? {},
            uuid: Utils.uuid3(),
            prod: this.scriptId,
            data: []
        }
        pane.overlays.push(ov)
        return ov
    }

    // Add new value to overlay's data
    addNewValue(ov: any, x: any): void {
        let off = 0
        if (x && x.__id__) {
            off = x.__offset__ || 0
            x = x[0]
        }
        if (Array.isArray(x) && x[0] && x[0].__id__) {
            off = x[0].__offset__ || 0
            x = x.map((x: any) => x[0])
        }
        off *= se.tf!
        let v = Array.isArray(x) ?
            [se.t + off, ...x] : [se.t + off, x]
        u.update(ov.data, v)
    }

    createPane(): PaneStruct {
        // TODO: implement
        throw new Error('createPane not implemented')
    }
}
