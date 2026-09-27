import { afterEach, describe, expect, it } from 'vitest'
import { DataScanner } from '../../src/core/dataScanner'
import DataHub from '../../src/core/dataHub'
import Events from '../../src/core/events'
import SeClient from '../../src/core/se/seClient'
import Const from '../../src/stuff/constants'

const id = 'single-candle-range'
const timestamp = 1704067200000

function scanner(indexBased: boolean, timeFrame?: string) {
    const hub = DataHub.instance(id)
    hub.init({
        indexBased,
        panes: [
            {
                overlays: [
                    {
                        type: 'Candles',
                        main: true,
                        data: [[timestamp, 1, 2, 0, 1]],
                        settings: timeFrame ? { timeFrame } : {}
                    }
                ]
            }
        ]
    })
    const scan = new DataScanner()
    scan.init({ id, config: Const.ChartConfig })
    return scan
}

afterEach(() => {
    DataHub.release(id)
    Events.release(id)
    SeClient.release(id)
})

describe('single-candle range', () => {
    it('positions one index-based candle without an inferred timeframe', () => {
        const scan = scanner(true)
        const range = scan.defaultRange()
        expect(scan.interval).toBe(1)
        expect(range).toHaveLength(2)
        expect(range.every(Number.isFinite)).toBe(true)
        expect(range[0]).toBeLessThan(0)
        expect(range[1]).toBeGreaterThan(0)
    })

    it('waits for a second timestamp in time-based mode', () => {
        const scan = scanner(false)
        expect(scan.defaultRange()).toEqual([])
        scan.main.push([timestamp + 60000, 1, 2, 0, 1])
        scan.detectInterval()
        expect(scan.interval).toBe(60000)
        expect(scan.defaultRange()).toHaveLength(2)
    })

    it('positions one time-based candle when its timeframe is explicit', () => {
        const scan = scanner(false, '1m')
        const range = scan.defaultRange()
        expect(scan.interval).toBe(60000)
        expect(range).toHaveLength(2)
        expect(range.every(Number.isFinite)).toBe(true)
        expect(range[0]).toBeLessThan(timestamp)
        expect(range[1]).toBeGreaterThan(timestamp)
    })
})
