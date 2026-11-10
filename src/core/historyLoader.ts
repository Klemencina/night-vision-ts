import type { Candle } from './candleData'

export interface HistoryRequest {
    /** Exclusive upper timestamp, or null when the series is empty. */
    before: number | null
    signal: AbortSignal
}

export interface HistoryPage {
    rows: readonly Candle[]
    /** False marks the end of history. Empty pages also stop loading. */
    hasMore?: boolean
}

export type HistoryLoader = (request: HistoryRequest) => HistoryPage | Promise<HistoryPage>

export interface HistoryLoadingOptions {
    /** Load when the visible range starts within this many bars of the first candle. Defaults to 20. */
    threshold?: number
}

export interface HistorySource {
    key: object
    revision: number
    before: number | null
    range: [number, number] | null
    indexBased: boolean
    interval: number
}

interface HistoryHost {
    source(): HistorySource | null
    prepend(rows: readonly Candle[], isCurrent: () => boolean): Promise<number>
    emit(type: string, data: unknown): void
}

interface PendingRequest {
    abort: AbortController
    promise: Promise<number>
}

/** Owns one history subscription. Fetches run outside the chart's mutation queue. */
export default class HistoryLoading {
    private pending: PendingRequest | null = null
    private source: HistorySource | null = null
    private exhausted = false
    private stopped = false

    constructor(private host: HistoryHost, private loader: HistoryLoader, private threshold: number) {}

    check(range?: readonly number[]): void {
        const source = this.syncSource()
        if (!source || this.stopped || this.exhausted) return
        const start = (range || source.range)?.[0]
        const edge = source.indexBased ? 0 : source.before
        const margin = source.indexBased ? this.threshold :
            Number.isFinite(source.interval) && source.interval > 0 ? this.threshold * source.interval : 0
        if (source.before === null || (Number.isFinite(start) && start! <= edge! + margin)) {
            // Automatic requests report failures through $history-error.
            void this.load().catch(() => {})
        }
    }

    load(): Promise<number> {
        const source = this.syncSource()
        if (!source || this.stopped || this.exhausted) return Promise.resolve(0)
        if (this.pending) return this.pending.promise

        const abort = new AbortController()
        const pending: PendingRequest = { abort, promise: Promise.resolve(0) }
        this.pending = pending
        const isActive = () => !this.stopped && this.pending === pending && !abort.signal.aborted
        const isCurrent = () => {
            const current = this.host.source()
            return isActive() &&
                current?.key === source.key && current.revision === source.revision
        }
        let cancel!: () => void
        let continueLoading = false
        let applying = false
        const cancelled = new Promise<null>(resolve => { cancel = () => resolve(null) })
        abort.signal.addEventListener('abort', cancel, { once: true })
        pending.promise = Promise.resolve().then(async () => {
            if (!isCurrent()) return 0
            this.host.emit('$history-loading', { before: source.before })
            if (!isCurrent()) return 0
            const page = await Promise.race([
                Promise.resolve().then(() => this.loader({ before: source.before, signal: abort.signal })),
                cancelled
            ])
            if (!isCurrent()) return 0
            if (!page || !Array.isArray(page.rows) ||
                (page.hasMore !== undefined && typeof page.hasMore !== 'boolean')) {
                throw new TypeError('History loader must return { rows, hasMore? }')
            }
            applying = true
            const added = await Promise.race([this.host.prepend(page.rows, isCurrent), cancelled])
            if (added === null) return 0
            if (this.pending !== pending || abort.signal.aborted || (!added && !isCurrent())) return 0
            this.source = this.host.source()
            this.exhausted = page.hasMore === false || added === 0
            continueLoading = !this.exhausted
            this.host.emit('$history-loaded', { before: source.before, added, hasMore: !this.exhausted })
            return added
        }).catch(error => {
            // Creating the initial overlay changes the source key before its worker update completes.
            if (!isCurrent() && !(applying && isActive() && this.host.source()?.revision === source.revision)) return 0
            this.host.emit('$history-error', { before: source.before, error })
            throw error
        }).finally(() => {
            abort.signal.removeEventListener('abort', cancel)
            if (this.pending === pending) {
                this.pending = null
                if (continueLoading) this.check()
            }
        })
        return pending.promise
    }

    reset(): void {
        const pending = this.pending
        this.pending = null
        pending?.abort.abort()
        this.exhausted = false
        this.source = null
    }

    stop(): void {
        this.stopped = true
        this.reset()
    }

    private syncSource(): HistorySource | null {
        const source = this.host.source()
        if (this.source && (this.source.key !== source?.key || this.source.revision !== source?.revision)) {
            this.reset()
        }
        this.source = source
        return source
    }
}
