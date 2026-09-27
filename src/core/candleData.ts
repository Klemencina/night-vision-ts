/** Unix timestamp in milliseconds, followed by OHLC and optional volume. */
export type Candle =
    | readonly [timestamp: number, open: number, high: number, low: number, close: number]
    | readonly [
          timestamp: number,
          open: number,
          high: number,
          low: number,
          close: number,
          volume: number
      ]

export interface SetSeriesOptions {
    /** Reset to the default visible range. Defaults to true. */
    resetRange?: boolean
}

export function copyCandle(row: Candle): number[] {
    if (!Array.isArray(row) || (row.length !== 5 && row.length !== 6)) {
        throw new TypeError('A candle must contain [timestamp, open, high, low, close, volume?]')
    }
    const copy = Array.from(row)
    if (!copy.every(value => typeof value === 'number' && Number.isFinite(value))) {
        throw new TypeError('Candle values must be finite numbers')
    }
    const [, open, high, low, close, volume] = copy
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) {
        throw new RangeError('Candle high and low must contain its open and close')
    }
    if (volume !== undefined && volume < 0) {
        throw new RangeError('Candle volume cannot be negative')
    }
    return copy
}

export function copySeries(rows: readonly Candle[]): number[][] {
    if (!Array.isArray(rows)) throw new TypeError('Series must be an array of candles')
    const copy: number[][] = []
    for (const row of rows) {
        const candle = copyCandle(row)
        if (copy.length && candle[0] <= copy[copy.length - 1][0]) {
            throw new RangeError('Series timestamps must be strictly increasing')
        }
        copy.push(candle)
    }
    return copy
}
