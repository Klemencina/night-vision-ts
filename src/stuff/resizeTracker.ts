
// Track chart container boundraries & update
// the chart props

interface ChartWithResize {
    root: Element
    width: number
    height: number
}

export default function resizeTracker(chart: ChartWithResize): () => void {
    const resizeObserver = new ResizeObserver(() => {
        const rect = chart.root.getBoundingClientRect()
        chart.width = rect.width
        chart.height = rect.height
    })
    resizeObserver.observe(chart.root)
    
    // Return cleanup function
    return () => resizeObserver.disconnect()
}
