
// Track chart container boundraries & update
// the chart props

interface ChartWithResize {
    root: Element
    width: number
    height: number
}

export default function resizeTracker(chart: ChartWithResize): () => void {
    let rafId: number | null = null
    const scheduleMeasure = () => {
        if (rafId !== null) return
        rafId = requestAnimationFrame(() => {
            rafId = null
            const rect = chart.root.getBoundingClientRect()
            chart.width = rect.width
            chart.height = rect.height
        })
    }

    const resizeObserver = new ResizeObserver(() => scheduleMeasure())
    resizeObserver.observe(chart.root)

    // On mobile, autoResize listens to visualViewport changes so address-bar
    // show/hide does not spam immediate size writes; measurements are still
    // throttled to once per frame.
    const visualViewport = window.visualViewport
    const handleViewport = visualViewport ? () => scheduleMeasure() : null
    if (visualViewport && handleViewport) {
        visualViewport.addEventListener('resize', handleViewport)
        visualViewport.addEventListener('scroll', handleViewport)
    }

    scheduleMeasure()

    // Return cleanup function
    return () => {
        resizeObserver.disconnect()
        if (visualViewport && handleViewport) {
            visualViewport.removeEventListener('resize', handleViewport)
            visualViewport.removeEventListener('scroll', handleViewport)
        }
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
        }
    }
}
