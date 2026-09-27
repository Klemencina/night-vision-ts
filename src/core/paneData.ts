import type { Overlay, Pane, Script } from './dataHub'
import { copySeries, type Candle } from './candleData'

/** A UUID, or a zero-based position resolved when the queued operation runs. */
export type DataTarget = string | number
export type OverlayRow = readonly [timestamp: number, ...values: unknown[]]

export interface DataUpdateOptions {
    /** Preserve the visible range by default. */
    resetRange?: boolean
}

export interface OverlayInput {
    type: string
    name?: string
    main?: boolean
    data?: readonly OverlayRow[]
    settings?: Record<string, unknown>
    props?: Record<string, unknown>
}

export type OverlayPatch = Partial<OverlayInput>

export interface IndicatorInput {
    type: string
    name?: string
    props?: Record<string, unknown>
    settings?: Record<string, unknown>
}

export type IndicatorPatch = Partial<IndicatorInput>

export interface PaneInput {
    settings?: Record<string, unknown>
    overlays?: readonly OverlayInput[]
}

export interface PanePatch {
    settings?: Record<string, unknown>
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new TypeError(`${label} must be a plain object`)
    }
}

function fields(value: unknown, allowed: string[], label: string): asserts value is Record<string, unknown> {
    record(value, label)
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) throw new TypeError(`Unsupported ${label} field: ${key}`)
    }
}

export function copyOverlay(input: OverlayPatch, required = false): Overlay {
    fields(input, ['type', 'name', 'main', 'data', 'settings', 'props'], 'overlay')
    if (required || 'type' in input) {
        if (typeof input.type !== 'string' || !input.type.trim()) {
            throw new TypeError('Overlay type must be a nonempty string')
        }
    }
    if ('name' in input && typeof input.name !== 'string') throw new TypeError('Overlay name must be a string')
    if ('main' in input && typeof input.main !== 'boolean') throw new TypeError('Overlay main must be a boolean')
    for (const key of ['settings', 'props'] as const) {
        if (key in input) record(input[key], `Overlay ${key}`)
    }
    if ('data' in input) {
        if (!Array.isArray(input.data)) throw new TypeError('Overlay data must be an array')
        let previous = -Infinity
        for (const row of input.data) {
            if (!Array.isArray(row) || !Number.isFinite(row[0])) {
                throw new TypeError('Overlay rows must start with a finite timestamp')
            }
            if (row[0] <= previous) throw new RangeError('Overlay timestamps must be strictly increasing')
            previous = row[0]
        }
    }
    if (input.data) validateOverlayData(input.type, input.data)
    return structuredClone(input) as Overlay
}

export function copyOverlayPoint(row: OverlayRow): unknown[] {
    if (!Array.isArray(row) || !Number.isFinite(row[0])) {
        throw new TypeError('Overlay rows must start with a finite timestamp')
    }
    return structuredClone(row) as unknown[]
}

export function copyIndicator(input: IndicatorPatch, required = false): Script {
    fields(input, ['type', 'name', 'settings', 'props'], 'indicator')
    if (required || 'type' in input) {
        if (typeof input.type !== 'string' || !input.type.trim()) {
            throw new TypeError('Indicator type must be a nonempty string')
        }
    }
    if ('name' in input && typeof input.name !== 'string') {
        throw new TypeError('Indicator name must be a string')
    }
    for (const key of ['settings', 'props'] as const) {
        if (key in input) record(input[key], `Indicator ${key}`)
    }
    return structuredClone(input) as Script
}

export function validateOverlayData(type: string | undefined, data: readonly unknown[]): void {
    if (type === 'Candles' || type === 'CandlesPlus') copySeries(data as readonly Candle[])
}

export function copyPane(input: PaneInput, patch = false): Pane {
    fields(input, patch ? ['settings'] : ['settings', 'overlays'], 'pane')
    if ('settings' in input) record(input.settings, 'Pane settings')
    if ('overlays' in input && !Array.isArray(input.overlays)) {
        throw new TypeError('Pane overlays must be an array')
    }
    const pane: Pane = {}
    if (input.settings) pane.settings = structuredClone(input.settings)
    if (Array.isArray(input.overlays)) pane.overlays = Array.from(input.overlays, overlay => copyOverlay(overlay, true))
    if ((pane.overlays || []).filter(overlay => overlay.main).length > 1) {
        throw new RangeError('A pane can contain only one main overlay')
    }
    return pane
}

export function resetRangeOption(options: DataUpdateOptions): boolean {
    const resetRange = options.resetRange ?? false
    if (typeof resetRange !== 'boolean') throw new TypeError('resetRange must be a boolean')
    return resetRange
}

export function findTarget<T extends { uuid?: string }>(items: T[], target: DataTarget, label: string): T {
    if (typeof target !== 'string' && !(typeof target === 'number' && Number.isInteger(target) && target >= 0)) {
        throw new TypeError(`${label} target must be a UUID or a nonnegative integer`)
    }
    const item = typeof target === 'string' ? items.find(item => item.uuid === target) : items[target]
    if (!item) throw new RangeError(`${label} not found: ${target}`)
    return item
}
