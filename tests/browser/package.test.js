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

                await t.test('edits SMA length and applies it to the next candle', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const pane = chart.hub.panes()[0]
                        const script = pane.scripts[0]
                        const range = [...chart.range]
                        const originalProps = { ...script.props }
                        try {
                            await chart.updateIndicator(pane.uuid, script.uuid, {
                                props: { length: 3 }
                            })
                            const changed = pane.overlays.find(ov => ov.prod === script.uuid)
                            const closes = chart.hub.mainOv.data.slice(-3).map(row => row[4])
                            const expected = closes.reduce((sum, close) => sum + close, 0) / 3
                            const afterEdit = {
                                value: changed.data.at(-1)[1], expected,
                                prod: changed.prod,
                                length: script.props.length,
                                range: [...chart.range]
                            }
                            const last = [...chart.hub.mainOv.data.at(-1)]
                            last[4] += 12
                            last[2] = Math.max(last[2], last[4])
                            await chart.updateCandle(last)
                            const live = pane.overlays.find(ov => ov.prod === script.uuid)
                            const liveCloses = chart.hub.mainOv.data.slice(-3).map(row => row[4])
                            return {
                                range, afterEdit,
                                liveValue: live.data.at(-1)[1],
                                liveExpected: liveCloses.reduce((sum, close) => sum + close, 0) / 3
                            }
                        } finally {
                            await chart.updateIndicator(pane.uuid, script.uuid, {
                                props: originalProps
                            })
                        }
                    })
                    assert.equal(result.afterEdit.prod.length > 0, true)
                    assert.equal(result.afterEdit.length, 3)
                    assert.deepEqual(result.afterEdit.range, result.range)
                    assert.ok(Math.abs(result.afterEdit.value - result.afterEdit.expected) < 1e-8)
                    assert.ok(Math.abs(result.liveValue - result.liveExpected) < 1e-8)
                    await checkSma(page)
                })

                await t.test('adds RSI to a pane and removes its generated output', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const range = [...chart.range]
                        const paneId = await chart.addPane()
                        try {
                            const unknown = await chart.addIndicator(paneId, {
                                type: 'MissingIndicator'
                            }).then(() => 'accepted', error => error.name)
                            const scriptId = await chart.addIndicator(paneId, {
                                type: 'RSI', props: { length: 7 }
                            })
                            const pane = chart.hub.panes().find(item => item.uuid === paneId)
                            const output = pane.overlays.find(ov => ov.prod === scriptId)
                            const added = {
                                unknown, scriptId, scriptType: pane.scripts[0].type,
                                outputType: output?.type, outputProd: output?.prod,
                                outputRows: output?.data.length,
                                paneCount: chart.hub.panes().length,
                                range: [...chart.range]
                            }
                            await chart.removeIndicator(paneId, 0)
                            return {
                                added,
                                remainingScripts: pane.scripts.length,
                                remainingOutputs: pane.overlays.filter(ov => ov.prod === scriptId).length,
                                rangeAfterRemove: [...chart.range],
                                smaRows: window.indicator().data.length,
                                range
                            }
                        } finally {
                            await chart.removePane(paneId)
                        }
                    })
                    assert.equal(result.added.unknown, 'RangeError')
                    assert.equal(result.added.scriptType, 'RSI')
                    assert.equal(result.added.outputType, 'Range')
                    assert.equal(result.added.outputProd, result.added.scriptId)
                    assert.equal(result.added.outputRows, 37)
                    assert.equal(result.added.paneCount, 2)
                    assert.equal(result.remainingScripts, 0)
                    assert.equal(result.remainingOutputs, 0)
                    assert.equal(result.smaRows, 37)
                    assert.deepEqual(result.added.range, result.range)
                    assert.deepEqual(result.rangeAfterRemove, result.range)
                    await checkSma(page)
                })

                await t.test('keeps the other SMA when two generate Spline overlays', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const pane = chart.hub.panes()[0]
                        const originalId = pane.scripts[0].uuid
                        const originalRows = chart.hub.mainOv.data.map(row => [...row])
                        const firstId = await chart.addIndicator(pane.uuid, {
                            type: 'SMA', props: { length: 3 }
                        })
                        const secondId = await chart.addIndicator(pane.uuid, {
                            type: 'SMA', props: { length: 7 }
                        })
                        try {
                            const before = pane.overlays.filter(ov => ov.type === 'Spline' && ov.prod)
                                .map(ov => ov.prod)
                            await chart.removeIndicator(pane.uuid, firstId)
                            const after = pane.overlays.filter(ov => ov.type === 'Spline' && ov.prod)
                                .map(ov => ov.prod)
                            const last = chart.hub.mainOv.data.at(-1)
                            await chart.updateCandle([
                                last[0] + 300000, 260, 270, 250, 265, 10
                            ])
                            const remaining = pane.overlays.find(ov => ov.prod === secondId)
                            const closes = chart.hub.mainOv.data.slice(-7).map(row => row[4])
                            return {
                                originalId, firstId, secondId, before, after,
                                liveValue: remaining.data.at(-1)[1],
                                liveExpected: closes.reduce((sum, close) => sum + close, 0) / 7,
                                liveTimestamp: remaining.data.at(-1)[0],
                                candleTimestamp: chart.hub.mainOv.data.at(-1)[0]
                            }
                        } finally {
                            await chart.removeIndicator(pane.uuid, secondId)
                            await chart.setSeries(originalRows, { resetRange: false })
                        }
                    })
                    assert.deepEqual(new Set(result.before), new Set([
                        result.originalId, result.firstId, result.secondId
                    ]))
                    assert.deepEqual(new Set(result.after), new Set([
                        result.originalId, result.secondId
                    ]))
                    assert.ok(Math.abs(result.liveValue - result.liveExpected) < 1e-8)
                    assert.equal(result.liveTimestamp, result.candleTimestamp)
                    await checkSma(page)
                })

                await t.test('streams Spline points without changing candle or SMA data', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const paneId = chart.hub.panes()[0].uuid
                        const range = [...chart.range]
                        const last = chart.hub.mainOv.data.at(-1)
                        const overlayId = await chart.addOverlay(paneId, {
                            type: 'Spline', data: [[last[0], 10]]
                        })
                        const emptyId = await chart.addOverlay(paneId, {
                            type: 'Spline', data: []
                        })
                        try {
                            const smaData = window.indicator().data
                            const smaLast = [...smaData.at(-1)]
                            const pane = chart.hub.panes()[0]
                            const overlay = pane.overlays.find(ov => ov.uuid === overlayId)
                            const data = overlay.data
                            const replacement = [last[0], 20, { note: { value: 1 } }]
                            await chart.updateOverlayPoint(paneId, overlayId, replacement)
                            replacement[2].note.value = 99
                            const replaced = structuredClone(overlay.data.at(-1))
                            const point = [last[0] + 300000, 30, { note: { value: 2 } }]
                            await chart.updateOverlayPoint(paneId, overlayId, point)
                            point[2].note.value = 99
                            const appended = structuredClone(overlay.data.at(-1))
                            const beforeStale = JSON.stringify(overlay.data)
                            const stale = await chart.updateOverlayPoint(paneId, overlayId, [
                                last[0], 99
                            ]).then(() => 'accepted', error => error.name)
                            const afterStale = JSON.stringify(overlay.data)
                            await chart.updateOverlayPoint(paneId, emptyId, [last[0], 5])
                            const empty = pane.overlays.find(ov => ov.uuid === emptyId)
                            return {
                                replaced, appended, stale, beforeStale, afterStale,
                                dataLength: overlay.data.length,
                                sameData: overlay.data === data,
                                indexOffset: overlay.indexOffset,
                                expectedOffset: chart.hub.mainOv.data.length - 1,
                                emptyData: structuredClone(empty.data),
                                range: [...chart.range], previousRange: range,
                                sameSmaData: window.indicator().data === smaData,
                                smaLast: [...window.indicator().data.at(-1)],
                                previousSmaLast: smaLast
                            }
                        } finally {
                            await chart.removeOverlay(paneId, overlayId)
                            await chart.removeOverlay(paneId, emptyId)
                        }
                    })
                    assert.deepEqual(result.replaced, [result.replaced[0], 20, {
                        note: { value: 1 }
                    }])
                    assert.deepEqual(result.appended, [result.appended[0], 30, {
                        note: { value: 2 }
                    }])
                    assert.equal(result.dataLength, 2)
                    assert.equal(result.sameData, true)
                    if (indexBased) assert.equal(result.indexOffset, result.expectedOffset)
                    assert.equal(result.stale, 'RangeError')
                    assert.equal(result.afterStale, result.beforeStale)
                    assert.equal(result.emptyData.length, 1)
                    assert.equal(result.emptyData[0][1], 5)
                    assert.deepEqual(result.range, result.previousRange)
                    assert.equal(result.sameSmaData, true)
                    assert.deepEqual(result.smaLast, result.previousSmaLast)
                    await checkSma(page)
                })

                await t.test('adds and edits panes and overlays by stable UUID', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const beforeRange = [...chart.range]
                        const rows = chart.hub.mainOv.data
                        const paneInput = {
                            settings: { height: 0.3, tag: 'first' },
                            overlays: [{
                                type: 'Spline',
                                name: 'First series',
                                data: rows.map(row => [row[0], row[4]])
                            }]
                        }
                        const firstPaneId = await chart.addPane(paneInput)
                        const secondPaneId = await chart.addPane({
                            settings: { height: 0.4, tag: 'second' },
                            overlays: [{
                                type: 'Spline',
                                name: 'Second series',
                                data: rows.map(row => [row[0], row[4] + 5])
                            }]
                        })
                        const secondOverlayId = chart.hub.panes()[2].overlays[0].uuid
                        const input = {
                            type: 'Histogram',
                            name: 'Added histogram',
                            data: rows.map((row, i) => [row[0], i + 1]),
                            props: { barWidth: 4 },
                            settings: { scale: 'B' }
                        }
                        const pending = chart.addOverlay(secondPaneId, input)
                        input.data[0][1] = -1000
                        input.props.barWidth = 99
                        const addedOverlayId = await pending
                        await chart.removePane(firstPaneId)
                        await chart.updatePane(secondPaneId, {
                            settings: { height: 0.5 }
                        })
                        await chart.updateOverlay(secondPaneId, addedOverlayId, {
                            name: 'Updated histogram',
                            data: rows.map((row, i) => [row[0], i + 2]),
                            props: { lineWidth: 3 },
                            settings: { display: false }
                        })
                        const pane = chart.hub.panes()[1]
                        const updated = pane.overlays.find(ov => ov.uuid === addedOverlayId)
                        const workerId = chart.hub.panes()[0].overlays.find(ov => ov.prod)?.uuid
                        const workerEdit = await chart.removeOverlay(0, workerId).then(
                            () => 'accepted', error => error.name
                        )
                        const snapshot = {
                            beforeRange,
                            afterRange: [...chart.range],
                            paneId: pane.uuid,
                            paneIndex: pane.id,
                            layoutGrids: chart.layout.grids.length,
                            paneSettings: pane.settings,
                            retainedOverlayId: pane.overlays[0].uuid,
                            addedOverlayId: updated.uuid,
                            addedFirstValue: updated.data[0][1],
                            props: updated.props,
                            settings: updated.settings,
                            name: updated.name,
                            workerEdit
                        }
                        await new Promise(resolve => requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        ))
                        snapshot.renderedPanes = document.querySelectorAll('.nvjs-pane').length
                        snapshot.legendNames = [...document.querySelectorAll('.nvjs-ll-name')]
                            .map(node => node.textContent.trim())
                        await chart.removeOverlay(1, 0)
                        snapshot.remainingOverlayId = chart.hub.panes()[1].overlays[0].uuid
                        await chart.removePane(secondPaneId)
                        snapshot.finalPaneCount = chart.hub.panes().length
                        return snapshot
                    })
                    assert.deepEqual(result.afterRange, result.beforeRange)
                    assert.equal(result.paneIndex, 1)
                    assert.equal(result.paneId.length > 0, true)
                    assert.equal(result.layoutGrids, 2)
                    assert.equal(result.renderedPanes, 2)
                    assert.ok(result.legendNames.includes('Updated histogram'))
                    assert.equal(result.paneSettings.tag, 'second')
                    assert.equal(result.paneSettings.height, 0.5)
                    assert.equal(result.addedFirstValue, 2)
                    assert.equal(result.props.barWidth, 4)
                    assert.equal(result.props.lineWidth, 3)
                    assert.equal(result.settings.scale, 'B')
                    assert.equal(result.settings.display, false)
                    assert.equal(result.name, 'Updated histogram')
                    assert.equal(result.workerEdit, 'TypeError')
                    assert.equal(result.remainingOverlayId, result.addedOverlayId)
                    assert.notEqual(result.retainedOverlayId, result.addedOverlayId)
                    assert.equal(result.finalPaneCount, 1)
                    await checkSma(page)
                    await page.waitForFunction(() =>
                        document.querySelectorAll('.nvjs-pane').length === 1 &&
                        window.hasCandlePixels()
                    )
                })

                await t.test('moves the main source between existing panes', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const originalId = chart.hub.mainOv.uuid
                        const paneId = await chart.addPane({ overlays: [{
                            type: 'Candles', name: 'New source',
                            data: chart.hub.mainOv.data.map(row => [...row])
                        }] })
                        await chart.updateOverlay(paneId, 0, { main: true })
                        chart.hub.legendCollapsed = true
                        chart.events.emit('update-legend')
                        await new Promise(resolve => requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        ))
                        const snapshot = {
                            mainPane: chart.hub.mainPaneId,
                            legendNames: [...document.querySelectorAll('.nvjs-ll-name')]
                                .map(node => node.textContent.trim())
                        }
                        await chart.updateOverlay(0, originalId, { main: true })
                        await chart.removePane(paneId)
                        chart.hub.legendCollapsed = false
                        chart.events.emit('update-legend')
                        return snapshot
                    })
                    assert.equal(result.mainPane, 1)
                    assert.deepEqual(result.legendNames, ['New source'])
                    await checkSma(page)
                })

                await t.test('promotes a remaining candle overlay and restores an empty chart', async () => {
                    const result = await page.evaluate(async () => {
                        const chart = window.chart
                        const originalId = chart.hub.mainOv.uuid
                        const rows = chart.hub.mainOv.data.map(row => [...row])
                        const replacementId = await chart.addOverlay(0, {
                            type: 'Candles', name: 'Replacement candles', data: rows
                        })
                        await chart.removeOverlay(0, originalId)
                        const promoted = {
                            uuid: chart.hub.mainOv.uuid,
                            main: chart.hub.mainOv.main,
                            workerRows: window.indicator()?.data.length
                        }
                        await chart.removeOverlay(0, replacementId)
                        const empty = {
                            main: chart.hub.mainOv,
                            overlays: chart.hub.allOverlays().length,
                            layoutMain: Boolean(chart.layout?.main)
                        }
                        await chart.setSeries(rows)
                        const restored = {
                            candles: chart.hub.mainOv.data.length,
                            indicatorRows: window.indicator()?.data.length
                        }
                        await chart.removePane(0)
                        const noPanes = chart.hub.panes().length
                        const paneId = await chart.addPane({
                            overlays: [{ type: 'Candles', main: true, data: rows }]
                        })
                        return {
                            replacementId, promoted, empty, restored, noPanes,
                            paneId, finalMain: chart.hub.mainOv.uuid,
                            finalRows: chart.hub.mainOv.data.length
                        }
                    })
                    assert.equal(result.promoted.uuid, result.replacementId)
                    assert.equal(result.promoted.main, true)
                    assert.equal(result.promoted.workerRows, 37)
                    assert.deepEqual(result.empty, {
                        main: null, overlays: 0, layoutMain: false
                    })
                    assert.deepEqual(result.restored, { candles: 37, indicatorRows: 37 })
                    assert.equal(result.noPanes, 0)
                    assert.ok(result.paneId)
                    assert.ok(result.finalMain)
                    assert.equal(result.finalRows, 37)
                    await page.waitForFunction(() =>
                        document.querySelectorAll('.nvjs-pane').length === 1 &&
                        window.hasCandlePixels()
                    )
                })

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

                await t.test('adds an indicator before candles and streams the main overlay', async () => {
                    await page.evaluate(indexBased => {
                        window.createChart(indexBased, { empty: true, noMain: true })
                    }, indexBased)
                    try {
                        const result = await page.evaluate(async () => {
                            const chart = window.chart
                            const paneId = chart.hub.panes()[0].uuid
                            const indicatorId = await chart.addIndicator(paneId, {
                                type: 'RSI', props: { length: 3 }
                            })
                            const beforeSource = {
                                main: chart.hub.mainOv,
                                scriptId: chart.hub.panes()[0].scripts[1].uuid
                            }
                            const candleId = await chart.addOverlay(paneId, {
                                type: 'Candles', main: true, data: []
                            })
                            const rows = window.sampleRows(5)
                            await chart.updateOverlayPoint(paneId, candleId, rows[0])
                            const afterFirst = chart.hub.mainOv.data.length
                            await chart.updateOverlayPoint(paneId, candleId, rows[1])
                            const afterSecond = chart.hub.mainOv.data.length
                            for (const row of rows.slice(2)) {
                                await chart.updateOverlayPoint(paneId, candleId, row)
                            }
                            const rsi = chart.hub.panes()[0].overlays.find(ov =>
                                ov.prod === indicatorId
                            )
                            return {
                                beforeSource, indicatorId, candleId,
                                afterFirst, afterSecond,
                                mainId: chart.hub.mainOv.uuid,
                                candles: chart.hub.mainOv.data.length,
                                smaRows: window.indicator().data.length,
                                rsiRows: rsi?.data.length,
                                rsiLast: rsi?.data.at(-1)?.[1],
                                smaLast: window.indicator().data.at(-1)?.[1],
                                expectedSma: window.expectedSma()
                            }
                        })
                        assert.equal(result.beforeSource.main, null)
                        assert.equal(result.beforeSource.scriptId, result.indicatorId)
                        assert.equal(result.mainId, result.candleId)
                        assert.equal(result.afterFirst, 1)
                        assert.equal(result.afterSecond, 2)
                        assert.equal(result.candles, 5)
                        assert.equal(result.smaRows, 5)
                        assert.equal(result.rsiRows, 5)
                        assert.ok(Number.isFinite(result.rsiLast))
                        assert.ok(Math.abs(result.smaLast - result.expectedSma) < 1e-8)
                    } finally {
                        const closed = [...workers].map(worker =>
                            once(worker, 'close', { signal: AbortSignal.timeout(15000) })
                        )
                        await page.evaluate(() => window.chart.destroy())
                        await Promise.all(closed)
                    }
                    assert.equal(workers.size, 0)
                })

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
