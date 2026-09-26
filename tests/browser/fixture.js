const mode = new URLSearchParams(location.search).get('format')
const { NightVision } = mode === 'umd' ? window.NightVision : await import('night-vision-ts')

window.createChart = (indexBased = false) => {
    const data = Array.from({ length: 80 }, (_, i) => {
        const close = 100 + i + (i % 2 ? -2 : 2)
        return [1704067200000 + i * 60000, 100 + i, close + 4, close - 4, close, 1000 + i]
    })
    window.chart = new NightVision('chart', {
        id: 'browser-test',
        autoResize: true,
        indexBased,
        colors: { candleUp: '#00ff00', candleDw: '#ff0000' },
        data: {
            panes: [
                {
                    overlays: [{ name: 'Test candles', type: 'Candles', main: true, data }],
                    scripts: [{ type: 'SMA', props: { length: 5 } }]
                }
            ]
        }
    })
}

window.indicator = () => window.chart.hub.allOverlays().find(overlay => overlay.prod)
window.expectedSma = () => {
    const rows = window.chart.hub.mainOv.data.slice(-5)
    return rows.reduce((sum, row) => sum + row[4], 0) / rows.length
}

window.chartPixels = () => document.querySelector('.nvjs-canvas-rendrer canvas').toDataURL()

// Check candle colors, so an empty canvas or grid alone cannot pass.
window.hasCandlePixels = () =>
    [...document.querySelectorAll('.nvjs-canvas-rendrer canvas')].some(canvas => {
        if (!canvas.width || !canvas.height) return false
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let count = 0
        for (let i = 0; i < pixels.length; i += 4) {
            if (
                pixels[i + 3] > 200 &&
                pixels[i + 2] < 20 &&
                ((pixels[i] > 230 && pixels[i + 1] < 20) || (pixels[i + 1] > 230 && pixels[i] < 20))
            )
                count++
        }
        return count > 100
    })
