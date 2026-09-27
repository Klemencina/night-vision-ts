import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const browserName = process.env.NIGHT_VISION_BROWSER || 'chromium'
const browserType = { chromium, firefox, webkit }[browserName]
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`)
let temporary
let server
let browser
let origin

before(
    async () => {
        temporary = await mkdtemp(join(tmpdir(), 'night-vision-browser-'))
        const packed = JSON.parse(
            execFileSync(
                'npm',
                ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary],
                { cwd: root, encoding: 'utf8' }
            )
        )
        execFileSync('tar', ['-xzf', join(temporary, packed[0].filename), '-C', temporary])
        const packageRoot = join(temporary, 'package')
        const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
        const entry = pkg.exports['.'].import.default.replace(/^\.\//, '/')
        const umd = pkg.unpkg.replace(/^\.\//, '/')
        const fixture = await readFile(join(root, 'tests/browser/fixture.js'))

        // Serve only files from the tarball, never the source tree or local dist.
        server = createServer(async (request, response) => {
            try {
                const url = new URL(request.url, 'http://localhost')
                if (url.pathname === '/') {
                    response.setHeader('Content-Type', 'text/html')
                    response.end(`<!doctype html><html><head><link rel="icon" href="data:,">
                    <style>#chart { width: 900px; height: 500px; }</style>
                    <script type="importmap">${JSON.stringify({ imports: { 'night-vision-ts': entry } })}</script>
                    ${url.searchParams.get('format') === 'umd' ? `<script src="${umd}"></script>` : ''}
                    </head><body><div id="chart"></div>
                    <script type="module" src="/fixture.js"></script></body></html>`)
                    return
                }
                if (url.pathname === '/fixture.js') {
                    response.setHeader('Content-Type', 'text/javascript')
                    response.end(fixture)
                    return
                }
                const file = resolve(packageRoot, `.${decodeURIComponent(url.pathname)}`)
                if (!file.startsWith(packageRoot + sep)) {
                    response.writeHead(403).end()
                    return
                }
                const content = await readFile(file)
                response.setHeader(
                    'Content-Type',
                    /\.(js|cjs)$/.test(file) ? 'text/javascript' : 'application/octet-stream'
                )
                response.end(content)
            } catch {
                response.writeHead(404).end()
            }
        })
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        origin = `http://127.0.0.1:${server.address().port}`
        const executablePath =
            browserName === 'chromium'
                ? process.env.CHROMIUM_PATH ||
                  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
                : undefined
        browser = await browserType.launch({ executablePath, headless: true })
        console.log(
            `Browser: ${browserName} ${browser.version()}; package: ${pkg.name}@${pkg.version}`
        )
    },
    { timeout: 60000 }
)

after(async () => {
    await browser?.close()
    if (server) await new Promise(resolve => server.close(resolve))
    if (temporary) await rm(temporary, { recursive: true, force: true })
})

async function waitForChart(page) {
    await page.waitForFunction(
        () => {
            const last = window.indicator()?.data.at(-1)
            return last && Number.isFinite(last[1]) && window.hasCandlePixels()
        },
        null,
        { timeout: 15000 }
    )
}

async function checkSma(page) {
    const result = await page.evaluate(() => ({
        actual: window.indicator().data.at(-1)[1],
        expected: window.expectedSma()
    }))
    assert.ok(Math.abs(result.actual - result.expected) < 1e-8, JSON.stringify(result))
}

for (const format of ['esm', 'umd']) {
    for (const indexBased of [false, true]) {
        test(
            `${format}, ${indexBased ? 'index' : 'time'} based chart`,
            { timeout: 90000 },
            async t => {
                const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
                const errors = []
                const workers = new Set()
                page.on('pageerror', error => errors.push(error.message))
                page.on('console', message => {
                    if (message.type() === 'error') errors.push(message.text())
                })
                page.on('requestfailed', request =>
                    errors.push(`${request.url()}: ${request.failure()?.errorText}`)
                )
                page.on('response', response => {
                    if (response.status() >= 400)
                        errors.push(`${response.status()} ${response.url()}`)
                })
                page.on('worker', worker => {
                    workers.add(worker)
                    worker.on('close', () => workers.delete(worker))
                })
                t.after(async () => {
                    await page.close()
                    assert.deepEqual(errors, [], 'Browser errors')
                })
                page.setDefaultTimeout(15000)
                await page.goto(`${origin}/?format=${format}`)
                await page.waitForFunction(() => typeof window.createChart === 'function')
                await page.evaluate(indexBased => window.createChart(indexBased), indexBased)
                try {
                    await waitForChart(page)
                } catch (error) {
                    console.error(
                        await page.evaluate(() => ({
                            overlays: window.chart.hub.allOverlays().map(ov => ({
                                type: ov.type,
                                prod: ov.prod,
                                last: ov.data.at(-1)
                            })),
                            pixels: window.hasCandlePixels(),
                            canvases: [...document.querySelectorAll('canvas')].map(c => [
                                c.id,
                                c.width,
                                c.height
                            ]),
                            tasks: Object.keys(window.chart.ww.tasks)
                        })),
                        errors
                    )
                    throw error
                }

                await t.test('renders candles and computes SMA in a real worker', async () => {
                    await waitForChart(page)
                    assert.equal(workers.size, 1)
                    await checkSma(page)
                })

                await t.test('updates the current candle and indicator', async () => {
                    const pixels = await page.evaluate(() => window.chartPixels())
                    await page.evaluate(async () => {
                        const row = [...window.chart.hub.mainOv.data.at(-1)]
                        row[4] += 10
                        row[2] = Math.max(row[2], row[4])
                        await window.chart.updateCandle(row)
                    })
                    await checkSma(page)
                    await page.waitForFunction(
                        pixels => window.hasCandlePixels() && window.chartPixels() !== pixels,
                        pixels
                    )
                })

                await t.test('appends a candle and updates indicator length', async () => {
                    const pixels = await page.evaluate(() => window.chartPixels())
                    const before = await page.evaluate(() => window.indicator().data.length)
                    const range = await page.evaluate(async () => {
                        const range = [...window.chart.range]
                        const rows = window.chart.hub.mainOv.data
                        const last = rows.at(-1)
                        await window.chart.updateCandle([last[0] + 60000, 190, 198, 188, 195, 2000])
                        return { before: range, after: [...window.chart.range] }
                    })
                    assert.deepEqual(range.after, range.before)
                    assert.equal(
                        await page.evaluate(() => window.indicator().data.length),
                        before + 1
                    )
                    await checkSma(page)
                    await page.waitForFunction(
                        pixels => window.hasCandlePixels() && window.chartPixels() !== pixels,
                        pixels
                    )
                })

                await t.test('replaces series and resets or preserves the range', async () => {
                    const result = await page.evaluate(async indexBased => {
                        const chart = window.chart
                        const manualRange = indexBased
                            ? [10, 30]
                            : [chart.hub.mainOv.data[10][0], chart.hub.mainOv.data[30][0]]
                        chart.range = manualRange
                        const rows = window.sampleRows(80, 1704153600000)
                        await chart.setSeries(rows, { resetRange: false })
                        const preserved = [...chart.range]
                        const first = chart.hub.mainOv.data[0][0]
                        await chart.setSeries(rows)
                        return {
                            manualRange,
                            preserved,
                            reset: [...chart.range],
                            first,
                            expectedFirst: rows[0][0]
                        }
                    }, indexBased)
                    assert.deepEqual(result.preserved, result.manualRange)
                    assert.notDeepEqual(result.reset, result.manualRange)
                    assert.equal(result.first, result.expectedFirst)
                    await checkSma(page)
                    await page.waitForFunction(() => window.hasCandlePixels())
                })

                await t.test('serializes a burst of copied candle updates', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const last = chart.hub.mainOv.data.at(-1)
                        const first = [last[0], 210, 215, 205, 212, 1]
                        const second = [last[0] + 60000, 220, 225, 215, 222, 2]
                        const third = [last[0] + 120000, 230, 235, 225, 232, 3]
                        const calls = [
                            chart.updateCandle(first),
                            chart.updateCandle(second),
                            chart.updateCandle(third)
                        ]
                        first[4] = -1
                        second[4] = -2
                        third[4] = -3
                        await Promise.all(calls)
                        return {
                            last: chart.hub.mainOv.data.at(-1),
                            previous: chart.hub.mainOv.data.at(-2),
                            length: chart.hub.mainOv.data.length
                        }
                    })
                    assert.equal(result.last[4], 232)
                    assert.equal(result.previous[4], 222)
                    assert.equal(result.length, 82)
                    await checkSma(page)
                })

                await t.test('rejects invalid and stale rows without changing data', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const before = JSON.stringify(chart.hub.mainOv.data)
                        const last = chart.hub.mainOv.data.at(-1)
                        const invalid = await Promise.allSettled([
                            chart.setSeries([last, last]),
                            chart.updateCandle([last[0] + 60000, 1, NaN, 1, 1]),
                            chart.updateCandle([last[0] - 60000, 1, 2, 0, 1])
                        ])
                        const afterInvalid = JSON.stringify(chart.hub.mainOv.data)
                        await chart.updateCandle([last[0] + 60000, 240, 245, 235, 242])
                        return {
                            outcomes: invalid.map(x => x.status),
                            before,
                            afterInvalid,
                            last: chart.hub.mainOv.data.at(-1)
                        }
                    })
                    assert.deepEqual(result.outcomes, ['rejected', 'rejected', 'rejected'])
                    assert.equal(result.afterInvalid, result.before)
                    assert.equal(result.last[4], 242)
                    await checkSma(page)
                })

                await t.test('clears the series and bootstraps from live candles', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        await chart.setSeries([])
                        const cleared = {
                            candles: chart.hub.mainOv.data.length,
                            indicator: window.indicator()?.data.length ?? 0
                        }
                        const start = 1704240000000
                        for (const row of window.sampleRows(5, start)) {
                            await chart.updateCandle(row)
                        }
                        return {
                            cleared,
                            candles: chart.hub.mainOv.data.length,
                            first: chart.hub.mainOv.data[0][0]
                        }
                    })
                    assert.deepEqual(result.cleared, { candles: 0, indicator: 0 })
                    assert.equal(result.candles, 5)
                    assert.equal(result.first, 1704240000000)
                    await checkSma(page)
                    await page.waitForFunction(() => window.hasCandlePixels())
                })

                await t.test(
                    'shows a single index-based candle before a timeframe can be inferred',
                    async () => {
                        const first = await page.evaluate(async () => {
                            await window.chart.setSeries(window.sampleRows(1))
                            return {
                                range: [...window.chart.range],
                                visibleRows: window.chart.hub.mainOv.dataSubset.length
                            }
                        })
                        if (indexBased) {
                            assert.equal(first.range.length, 2)
                            assert.ok(first.range.every(Number.isFinite))
                            assert.equal(first.visibleRows, 1)
                            await page.waitForFunction(() => window.hasCandlePixels())
                        } else {
                            // Time-based charts need either two timestamps or an explicit timeframe.
                            assert.deepEqual(first.range, [])
                        }
                        await page.evaluate(async () => {
                            await window.chart.updateCandle(window.sampleRows(2)[1])
                        })
                        assert.equal(
                            await page.evaluate(() => window.chart.hub.mainOv.dataSubset.length),
                            2
                        )
                        await page.waitForFunction(() => window.hasCandlePixels())
                    }
                )

                await t.test(
                    'replaces long history and changes the inferred timeframe',
                    async () => {
                        const result = await page.evaluate(async () => {
                            const chart = window.chart
                            await chart.setSeries(window.sampleRows(6001))
                            const longSeries = {
                                length: chart.hub.mainOv.data.length,
                                indicatorLength: window.indicator().data.length,
                                actual: window.indicator().data.at(-1)[1],
                                expected: window.expectedSma()
                            }
                            const rows = window
                                .sampleRows(37, 1704500000000)
                                .map((row, i) => [1704500000000 + i * 300000, ...row.slice(1)])
                            await chart.setSeries(rows)
                            const last = [...rows.at(-1)]
                            last[2] += 20
                            last[4] += 20
                            await chart.updateCandle(last)
                            return {
                                longSeries,
                                length: chart.hub.mainOv.data.length,
                                indicatorLength: window.indicator().data.length,
                                timeframe: chart.scan.tf,
                                mainTimestamp: chart.hub.mainOv.data.at(-1)[0],
                                indicatorTimestamp: window.indicator().data.at(-1)[0]
                            }
                        })
                        assert.equal(result.longSeries.length, 6001)
                        assert.equal(result.longSeries.indicatorLength, 6001)
                        assert.ok(
                            Math.abs(result.longSeries.actual - result.longSeries.expected) < 1e-8
                        )
                        assert.equal(result.length, 37)
                        assert.equal(result.indicatorLength, 37)
                        assert.equal(result.timeframe, 300000)
                        assert.equal(result.mainTimestamp, result.indicatorTimestamp)
                        await checkSma(page)
                        await page.waitForFunction(() => window.hasCandlePixels())
                    }
                )

                await t.test(
                    'resizes through ResizeObserver and preserves the right edge',
                    async () => {
                        const right = await page.evaluate(() => window.chart.range[1])
                        await page.evaluate(() => {
                            const root = document.getElementById('chart')
                            root.style.width = '640px'
                            root.style.height = '360px'
                        })
                        await page.waitForFunction(() => {
                            const chart = document.querySelector('.night-vision')
                            return (
                                chart?.getBoundingClientRect().width === 640 &&
                                chart?.getBoundingClientRect().height === 360 &&
                                window.chart.layout?.botbar?.width === 640 &&
                                window.hasCandlePixels()
                            )
                        })
                        assert.equal(await page.evaluate(() => window.chart.range[1]), right)
                        assert.equal(workers.size, 1)
                    }
                )

                await t.test(
                    'destroys workers and DOM, then reuses the chart ID three times',
                    async () => {
                        for (let i = 0; i < 3; i++) {
                            const closed = [...workers].map(worker =>
                                once(worker, 'close', {
                                    signal: AbortSignal.timeout(15000)
                                })
                            )
                            await page.evaluate(() => window.chart.destroy())
                            await Promise.all(closed)
                            await page.waitForFunction(
                                () => document.querySelectorAll('#chart canvas').length === 0
                            )
                            assert.equal(workers.size, 0)
                            await page.evaluate(
                                indexBased => window.createChart(indexBased),
                                indexBased
                            )
                            await waitForChart(page)
                            assert.equal(workers.size, 1)
                            await checkSma(page)
                        }
                        const closed = [...workers].map(worker =>
                            once(worker, 'close', {
                                signal: AbortSignal.timeout(15000)
                            })
                        )
                        await page.evaluate(() => window.chart.destroy())
                        await Promise.all(closed)
                        await page.waitForFunction(
                            () => document.querySelectorAll('#chart canvas').length === 0
                        )
                        assert.equal(workers.size, 0)
                    }
                )

                await t.test('accepts a series immediately on an empty chart', async () => {
                    await page.evaluate(indexBased => {
                        window.createChart(indexBased, { empty: true, noMain: true })
                        const rows = window.sampleRows()
                        window.initialSeries = window.chart.setSeries(rows)
                        rows[0][4] = -1000
                    }, indexBased)
                    await page.evaluate(() => window.initialSeries)
                    await waitForChart(page)
                    const result = await page.evaluate(() => ({
                        type: window.chart.hub.mainOv.type,
                        candles: window.chart.hub.mainOv.data.length,
                        firstClose: window.chart.hub.mainOv.data[0][4]
                    }))
                    assert.deepEqual(result, { type: 'Candles', candles: 80, firstClose: 102 })
                    await checkSma(page)

                    const closed = [...workers].map(worker =>
                        once(worker, 'close', { signal: AbortSignal.timeout(15000) })
                    )
                    const outcomes = await page.evaluate(async () => {
                        const chart = window.chart
                        const pending = chart.setSeries(window.sampleRows())
                        chart.destroy()
                        const pendingError = await pending.then(
                            () => null,
                            error => error.name
                        )
                        const laterError = await chart.updateCandle([1, 1, 1, 1, 1]).then(
                            () => null,
                            error => error.name
                        )
                        return { pendingError, laterError }
                    })
                    await Promise.all(closed)
                    assert.deepEqual(outcomes, {
                        pendingError: 'AbortError',
                        laterError: 'AbortError'
                    })
                    assert.equal(workers.size, 0)
                })
            }
        )
    }
}
