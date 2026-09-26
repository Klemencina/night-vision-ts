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
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
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
            process.env.CHROMIUM_PATH ||
            (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
        browser = await chromium.launch({ executablePath, headless: true })
        console.log(`Browser: ${browser.version()}; package: ${pkg.name}@${pkg.version}`)
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
                            overlays: window.chart.hub
                                .allOverlays()
                                .map(ov => ({
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
                        const row = window.chart.hub.mainOv.data.at(-1)
                        row[4] += 10
                        row[2] = Math.max(row[2], row[4])
                        await window.chart.se.updateData()
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
                    await page.evaluate(async () => {
                        const rows = window.chart.hub.mainOv.data
                        const last = rows.at(-1)
                        rows.push([last[0] + 60000, 190, 198, 188, 195, 2000])
                        await window.chart.se.updateData()
                    })
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
            }
        )
    }
}
