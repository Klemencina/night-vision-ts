import type { Data, Overlay } from './dataHub'
import type { ChartConfig, Colors } from '../interface'
import { copyIndicator, copyOverlay, type IndicatorInput, type OverlayInput } from './paneData'

export interface ChartStateOptions {
    /** Include authored overlay rows. Defaults to false. Indicator outputs are recalculated. */
    includeData?: boolean
}

export interface SavedScale {
    auto: boolean
    /** Upper and lower values for a manual price scale. */
    range?: [number, number]
}

export interface SavedOverlay extends OverlayInput {
    uuid: string
    dataExt: Record<string, unknown>
    /** UUID of an authored overlay sharing this series. */
    dataSource?: string
}

export interface SavedIndicator extends IndicatorInput {
    uuid: string
}

export interface SavedPane {
    uuid: string
    settings: Record<string, unknown>
    overlays: SavedOverlay[]
    scripts: SavedIndicator[]
    scales: Record<string, SavedScale>
}

export interface ChartState {
    version: 1
    indexBased: boolean
    range: [number, number] | null
    appearance: {
        colors: Colors
        config: ChartConfig
        timezone: number
        showLogo: boolean
    }
    panes: SavedPane[]
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new TypeError(`${label} must be a plain object`)
    }
}

/** Copy JSON values without silently losing functions, non-finite numbers, or cycles. */
function jsonCopy(value: unknown, path = 'state', seen = new WeakSet<object>()): any {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'object' || !value) throw new TypeError(`${path} must contain JSON values`)
    if (seen.has(value)) throw new TypeError(`${path} contains a cycle`)
    seen.add(value)
    try {
        if (Array.isArray(value)) {
            return Array.from(value, (item, i) => item === undefined ? null : jsonCopy(item, `${path}[${i}]`, seen))
        }
        record(value, path)
        return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, jsonCopy(item, `${path}.${key}`, seen)]))
    } finally { seen.delete(value) }
}

function pair(value: unknown, label: string, descending = false): void {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(x => typeof x === 'number' && Number.isFinite(x)) ||
        (descending ? value[0] <= value[1] : value[0] >= value[1])) {
        throw new RangeError(`${label} must contain two ordered finite numbers`)
    }
}

/** Validate a versioned state before touching a chart. Also snapshots caller-owned values. */
export function copyChartState(input: unknown): ChartState {
    const state = jsonCopy(input) as ChartState
    record(state, 'Chart state')
    if (state.version !== 1) throw new RangeError('Unsupported chart state version')
    if (typeof state.indexBased !== 'boolean') throw new TypeError('State indexBased must be a boolean')
    if (state.range !== null) pair(state.range, 'State range')
    record(state.appearance, 'State appearance')
    if (Object.keys(state.appearance).some(key => !['colors', 'config', 'timezone', 'showLogo'].includes(key))) {
        throw new TypeError('Unsupported state appearance field')
    }
    record(state.appearance.colors, 'State colors')
    record(state.appearance.config, 'State config')
    if (!Object.values(state.appearance.colors).every(color => typeof color === 'string')) {
        throw new TypeError('State colors must be strings')
    }
    if (typeof state.appearance.showLogo !== 'boolean' ||
        typeof state.appearance.timezone !== 'number' || !Number.isFinite(state.appearance.timezone)) {
        throw new TypeError('State appearance must specify a boolean showLogo and a finite timezone')
    }
    if (!Array.isArray(state.panes)) throw new TypeError('State panes must be an array')
    const ids = new Set<string>()
    const identity = (uuid: unknown) => {
        if (typeof uuid !== 'string' || !uuid.trim() || uuid.includes(':')) {
            throw new TypeError('State UUIDs must be nonempty strings without colons')
        }
        if (ids.has(uuid)) throw new RangeError(`Duplicate state UUID: ${uuid}`)
        ids.add(uuid)
    }
    let mains = 0
    const overlays = new Map<string, SavedOverlay>()
    for (const pane of state.panes) {
        record(pane, 'State pane')
        identity(pane.uuid)
        record(pane.settings, 'State pane settings')
        record(pane.scales, 'State pane scales')
        if (!Array.isArray(pane.overlays) || !Array.isArray(pane.scripts)) {
            throw new TypeError('State pane overlays and scripts must be arrays')
        }
        for (const overlay of pane.overlays) {
            record(overlay, 'State overlay')
            identity(overlay.uuid)
            overlays.set(overlay.uuid, overlay)
            record(overlay.dataExt, 'State overlay dataExt')
            copyOverlay(Object.fromEntries(Object.entries(overlay)
                .filter(([key]) => !['uuid', 'dataExt', 'dataSource'].includes(key))) as unknown as OverlayInput, true)
            if (overlay.dataSource !== undefined &&
                (typeof overlay.dataSource !== 'string' || overlay.data !== undefined)) {
                throw new TypeError('State dataSource must reference another overlay without supplying data')
            }
            if (overlay.main) mains++
        }
        for (const script of pane.scripts) {
            record(script, 'State indicator')
            identity(script.uuid)
            copyIndicator(Object.fromEntries(Object.entries(script)
                .filter(([key]) => key !== 'uuid')) as unknown as IndicatorInput, true)
        }
        for (const [id, scale] of Object.entries(pane.scales)) {
            if (!id || id.includes(':')) throw new TypeError('State scale IDs cannot be empty or contain colons')
            record(scale, 'State scale')
            if (typeof scale.auto !== 'boolean') throw new TypeError('State scale auto must be a boolean')
            if (scale.range !== undefined) pair(scale.range, 'State scale range', true)
            if (!scale.auto && !scale.range) throw new TypeError('Manual state scales require a range')
        }
    }
    const resolved = new Set<string>()
    const resolving = new Set<string>()
    const resolve = (id: string): void => {
        if (resolved.has(id)) return
        const overlay = overlays.get(id)
        if (!overlay) throw new RangeError(`Unknown state data source: ${id}`)
        if (resolving.has(id)) throw new RangeError('State data sources contain a cycle')
        resolving.add(id)
        if (overlay.dataSource !== undefined) resolve(overlay.dataSource)
        resolving.delete(id)
        resolved.add(id)
    }
    for (const id of overlays.keys()) resolve(id)
    if (mains > 1) throw new RangeError('State can contain only one main overlay')
    return state
}

export function captureChartState(
    data: Data, appearance: ChartState['appearance'], range: [number, number] | null,
    transforms: Record<string, any>[], includeData: boolean
): ChartState {
    const authored = (data.panes || []).flatMap(pane => pane.overlays || []).filter(overlay => !overlay.prod)
    const owners = new Map<any[], string>()
    for (const overlay of [...authored.filter(overlay => overlay.main), ...authored]) {
        if (overlay.data && !owners.has(overlay.data)) owners.set(overlay.data, overlay.uuid!)
    }
    return copyChartState({
        version: 1, indexBased: !!data.indexBased, appearance, range,
        panes: (data.panes || []).map((pane, i) => ({
            uuid: pane.uuid, settings: pane.settings || {},
            overlays: (pane.overlays || []).filter(overlay => !overlay.prod).map(overlay => ({
                uuid: overlay.uuid, type: overlay.type, name: overlay.name, main: !!overlay.main,
                settings: overlay.settings || {}, props: overlay.props || {}, dataExt: overlay.dataExt || {},
                ...(overlay.data && owners.get(overlay.data) !== overlay.uuid
                    ? { dataSource: owners.get(overlay.data) }
                    : includeData ? { data: overlay.data || [] } : {})
            })),
            scripts: (pane.scripts || []).map(script => ({
                uuid: script.uuid, type: script.type, name: script.name,
                settings: script.settings || {}, props: script.props || {}
            })),
            scales: Object.fromEntries(Object.entries(transforms[i] || {}).map(([id, transform]) => [id, {
                auto: transform.auto !== false,
                ...(transform.range ? { range: transform.range } : {})
            }]))
        }))
    })
}

/** Omitted data retains matching series. The main overlay can reuse the destination's main series. */
export function restoreChartData(state: ChartState, current: Data): Data {
    const overlays = (current.panes || []).flatMap(pane => pane.overlays || []).filter(overlay => !overlay.prod)
    const byId = new Map(overlays.map(overlay => [overlay.uuid, overlay]))
    const main = overlays.find(overlay => overlay.main) || overlays[0]
    const saved = new Map(state.panes.flatMap(pane => pane.overlays).map(overlay => [overlay.uuid, overlay]))
    const resolved = new Map<string, any[]>()
    const rowsFor = (overlay: SavedOverlay): any[] => {
        if (resolved.has(overlay.uuid)) return resolved.get(overlay.uuid)!
        // State rows were copied during validation and can become chart-owned arrays.
        const rows = (overlay.dataSource !== undefined ? rowsFor(saved.get(overlay.dataSource)!) :
            overlay.data || (byId.get(overlay.uuid) || (overlay.main ? main : undefined))?.data || []) as any[]
        copyOverlay({ type: overlay.type, data: rows }, true)
        resolved.set(overlay.uuid, rows)
        return rows
    }
    return { indexBased: state.indexBased, panes: state.panes.map(pane => ({
        uuid: pane.uuid, settings: pane.settings,
        scripts: pane.scripts.map(script => ({ ...script })),
        overlays: pane.overlays.map(overlay => {
            const rows = rowsFor(overlay)
            const metadata = Object.fromEntries(Object.entries(overlay).filter(([key]) => key !== 'dataSource'))
            return { ...metadata, data: rows } as Overlay
        })
    })) }
}
