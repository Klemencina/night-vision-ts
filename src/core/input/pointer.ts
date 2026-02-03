
// Regular mouse/touch input. The object can be
// attached to a renderer.
// ~ Information flow ~
// Input: mouse events / touch events
// Output: internal events

import FrameAnimation from '../../stuff/frame'
import Utils from '../../stuff/utils'
import math from '../../stuff/math'
import Events from '../events'
import DataHub from '../dataHub'
import MetaHub from '../metaHub'

interface Layout {
    scaleIndex: string
    B: number
    A: number
    width: number
    height: number
    $hi: number
    $lo: number
    settings: {
        logScale?: boolean
    }
    ti: (t: number, i: number) => number
}

interface Props {
    id: string
    config: {
        MIN_ZOOM: number
        MAX_ZOOM: number
        SCROLL_WHEEL: string
        ZOOM_MODE: string
    }
    range: number[]
    interval: number
}

interface Comp {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    props: Props
    layout: Layout
    rrUpdId: string
    gridUpdId: string
    id: number
}

interface Drug {
    x: number
    y: number
    r: number[]
    t: number
    o: number
    y_r?: number[]
    B: number
    t0: number
}

interface Pinch {
    t: number
    r: number[]
}

interface Cursor {
    scroll_lock?: boolean
    mode?: string
}

export default class Input {
    MIN_ZOOM!: number
    MAX_ZOOM!: number
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    props!: Props
    layout!: Layout
    rrId!: string
    gridUpdId!: string
    gridId!: number
    cursor: Cursor
    oldMeta: Record<string, any>
    range!: number[]
    interval!: number
    offsetX: number
    offsetY: number
    deltas: number
    wmode!: string
    hub!: any
    meta!: any
    events!: any
    hm?: any
    mc?: any
    drug: Drug | null
    pinch: Pinch | null
    fade?: FrameAnimation
    trackpad?: boolean
    touchRafId: number | null
    pendingPan?: { x: number; y: number }
    pendingPinchScale?: number
    
    // Event handler references
    private _mousemove?: (e: MouseEvent) => void
    private _mouseout?: (e: MouseEvent) => void
    private _mouseup?: (e: MouseEvent) => void
    private _mousedown?: (e: MouseEvent) => void
    private _click?: (e: MouseEvent) => void

    constructor() {
        this.cursor = {}
        this.oldMeta = {}
        this.offsetX = 0
        this.offsetY = 0
        this.deltas = 0
        this.drug = null
        this.pinch = null
        this.touchRafId = null
        this.pendingPan = undefined
        this.pendingPinchScale = undefined
    }

    async setup(comp: Comp): Promise<void> {

        this.MIN_ZOOM = comp.props.config.MIN_ZOOM
        this.MAX_ZOOM = comp.props.config.MAX_ZOOM

        if (Utils.isMobile) this.MIN_ZOOM *= 0.5

        this.canvas = comp.canvas
        this.ctx = comp.ctx
        this.props = comp.props
        this.layout = comp.layout
        this.rrId = comp.rrUpdId
        this.gridUpdId = comp.gridUpdId
        this.gridId = comp.id
        this.cursor = {} // TODO: implement
        this.oldMeta = {} // TODO: implement
        this.range = this.props.range
        this.interval = this.props.interval
        this.offsetX = 0
        this.offsetY = 0
        this.deltas = 0 // Wheel delta events
        this.wmode = this.props.config.SCROLL_WHEEL

        this.hub = DataHub.instance(this.props.id)
        this.meta = MetaHub.instance(this.props.id)
        this.events = Events.instance(this.props.id)

        // Check if canvas is ready before attaching listeners
        if (!this.canvas) {
            console.warn('Pointer: canvas not ready, skipping setup')
            return
        }
        
        await this.listeners()
        this.mouseEvents('addEventListener')
    }

    mouseEvents(cmd: 'addEventListener' | 'removeEventListener'): void {
        const events = ['mousemove', 'mouseout', 'mouseup', 'mousedown', 'click'] as const
        events.forEach(e => {
            if (cmd === 'addEventListener') {
                // Save the handler to remove it later
                (this as any)['_' + e] = (this as any)[e].bind(this)
            }
            ;(this.canvas as any)[cmd](e, (this as any)['_' + e])
        })
    }

    async listeners(): Promise<void> {
        const Hamster = await import('hamsterjs');
        const Hammer = await import('hammerjs');

        this.hm = Hamster.default(this.canvas)
        this.hm.wheel((event: any, delta: number) => this.mousezoom(-delta * 50, event))

        let mc = this.mc = new Hammer.Manager(this.canvas)
        let T = Utils.isMobile ? 10 : 0
        mc.add(new Hammer.Pan({ threshold: T}))
        mc.add(new Hammer.Tap())
        mc.add(new Hammer.Pinch({ threshold: 0}))
        mc.get('pinch').set({ enable: true })
        if (Utils.isMobile) mc.add(new Hammer.Press())

        mc.on('panstart', (event: any) => {
            if (this.cursor.scroll_lock) return
            if (this.cursor.mode === 'aim') {
                return this.emitCursorCoord(event)
            }
            let scaleId = this.layout.scaleIndex
            let tfrm = this.meta.getYtransform(this.gridId, scaleId)
            this.drug = {
                x: event.center.x + this.offsetX,
                y: event.center.y + this.offsetY,
                r: this.range.slice(),
                t: this.range[1] - this.range[0],
                o: tfrm ?
                    (tfrm.offset || 0) : 0,
                y_r: tfrm && tfrm.range ?
                    tfrm.range.slice() : undefined,
                B: this.layout.B,
                t0: Utils.now()
            }
            this.events.emit('cursor-locked', true)
            this.events.emit('cursor-changed', {
                gridId: this.gridId,
                x: event.center.x + this.offsetX,
                y: event.center.y + this.offsetY
            })
        })

        mc.on('panmove', (event: any) => {
            if (Utils.isMobile) {
                this.calcOffset()
                this.propagate('mousemove', this.touch2mouse(event))
            }
            if (this.drug) {
                if (this.shouldThrottleTouch(event)) {
                    this.pendingPan = {
                        x: this.drug.x + event.deltaX,
                        y: this.drug.y + event.deltaY,
                    }
                    this.scheduleTouchRangeUpdate()
                } else {
                    this.mousedrag(
                        this.drug.x + event.deltaX,
                        this.drug.y + event.deltaY,
                    )
                }
                /*this.events.emit('cursor-changed', {
                    gridId: this.gridId,
                    x: event.center.x + this.offsetX,
                    y: event.center.y + this.offsetY
                })*/
            } else if (this.cursor.mode === 'aim') {
                this.emitCursorCoord(event)
            }
        })

        mc.on('panend', (event: any) => {
            if (this.shouldThrottleTouch(event)) {
                this.flushTouchRangeUpdate()
            }
            if (Utils.isMobile && this.drug) {
                this.panFade()
            }
            this.drug = null
            this.events.emit('cursor-locked', false)
        })

        mc.on('tap', (event: any) => {
            if (!Utils.isMobile) return
            this.simMousedown(event)
            if (this.fade) this.fade.stop()
            this.events.emit('cursor-changed', {})
            this.events.emit('cursor-changed', {
                mode: 'explore'
            })
            this.events.emitSpec(this.rrId, 'update-rr')
        })

        mc.on('pinchstart', () =>  {
            this.drug = null
            this.pinch = {
                t: this.range[1] - this.range[0],
                r: this.range.slice()
            }
        })

        mc.on('pinchend', () =>  {
            this.flushTouchRangeUpdate()
            this.pinch = null
        })

        mc.on('pinch', (event: any) => {
            if (!this.pinch) return
            if (this.shouldThrottleTouch(event)) {
                this.pendingPinchScale = event.scale
                this.scheduleTouchRangeUpdate()
            } else {
                this.pinchZoom(event.scale)
            }
        })

        mc.on('press', (event: any) => {
            if (!Utils.isMobile) return
            if (this.fade) this.fade.stop()
            this.calcOffset()
            this.emitCursorCoord(event, { mode: 'aim' })
            setTimeout(() => this.events.emitSpec(this.rrId, 'update-rr'))
            this.simMousedown(event)
        })

        // TODO: Add only once?
        let add = this.canvas.addEventListener.bind(this.canvas)
        add("gesturestart", this.gesturestart)
        add("gesturechange", this.gesturechange)
        add("gestureend", this.gestureend)
    }

    gesturestart(event: Event): void { event.preventDefault() }
    gesturechange(event: Event): void { event.preventDefault() }
    gestureend(event: Event): void { event.preventDefault() }

    mousemove(event: MouseEvent): void {
        if (Utils.isMobile) return
        event = Utils.adjustMouse(event, this.canvas)
        this.events.emit('cursor-changed', {
            visible: true,
            gridId: this.gridId,
            x: (event as any).layerX,
            y: (event as any).layerY - 1 // Align with the crosshair
        })
        this.calcOffset()
        this.propagate('mousemove', event)
    }

    mouseout(event: MouseEvent): void {
        if (Utils.isMobile) return
        event = Utils.adjustMouse(event, this.canvas)
        this.events.emit('cursor-changed', { visible: false })
        this.propagate('mouseout', event)
    }

    mouseup(event: MouseEvent): void {
        event = Utils.adjustMouse(event, this.canvas)
        this.drug = null
        this.events.emit('cursor-locked', false)
        this.propagate('mouseup', event)
    }

    mousedown(event: MouseEvent): void {
        event = Utils.adjustMouse(event, this.canvas)
        if (Utils.isMobile) return
        this.events.emit('cursor-locked', true)
        this.propagate('mousedown', event)
        if (event.defaultPrevented) return
        this.events.emit('grid-mousedown', [this.gridId, event])
    }

    // Simulated mousedown (for mobile)
   simMousedown(event: any): void {
       event = Utils.adjustMouse(event, this.canvas)
       if (event.srcEvent.defaultPrevented) return
       this.events.emit('grid-mousedown', [this.gridId, event])
       this.propagate('mousemove', this.touch2mouse(event))
       this.events.emitSpec(this.rrId, 'update-rr')
       this.propagate('mousedown', this.touch2mouse(event))
       setTimeout(() => {
           this.propagate('click', this.touch2mouse(event))
       })
   }

   // Convert touch to "mouse" event
   touch2mouse(e: any): any {
       this.calcOffset()
       return {
           original: e.srcEvent,
           layerX: e.center.x + this.offsetX,
           layerY: e.center.y + this.offsetY,
           preventDefault: function(this: any) {
               this.original.preventDefault()
           }
       }
   }

   click(event: MouseEvent): void {
       this.propagate('click', event)
   }

   emitCursorCoord(event: any, add: Record<string, any> = {}): void {
       this.events.emit('cursor-changed', Object.assign({
           gridId: this.gridId,
           x: event.center.x + this.offsetX,
           y: event.center.y + this.offsetY //+ this.layout.offset
       }, add))
   }

    panFade(): void {
        let dt = Utils.now() - this.drug!.t0
       let dx = this.range[1] - this.drug!.r[1]
       let v = 42 * dx / dt
       let v0 = Math.abs(v * 0.01)
       if (dt > 500) return
       if (this.fade) this.fade.stop()
       this.fade = new FrameAnimation((self: FrameAnimation) => {
           v *= 0.85
           if (Math.abs(v) < v0) {
               self.stop()
           }
           this.range[0] += v
           this.range[1] += v
           this.changeRange()
       })
   }

   shouldThrottleTouch(event?: any): boolean {
       if (Utils.isMobile) return true
       if (!event) return false
       if (event.pointerType === 'touch') return true
       if (event.srcEvent?.pointerType === 'touch') return true
       if (event.srcEvent?.touches && event.srcEvent.touches.length > 0) {
           return true
       }
       return false
   }

   scheduleTouchRangeUpdate(): void {
       if (this.touchRafId !== null) return
       this.touchRafId = requestAnimationFrame(() => {
           this.touchRafId = null
           this.flushTouchRangeUpdate()
       })
   }

   flushTouchRangeUpdate(): void {
       let updated = false
       if (this.pendingPan && this.drug) {
           this.mousedrag(this.pendingPan.x, this.pendingPan.y, true)
           updated = true
       }
       if (this.pendingPinchScale !== undefined && this.pinch) {
           this.pinchZoom(this.pendingPinchScale, true)
           updated = true
       }
       if (updated) {
           this.changeRange()
       }
       this.pendingPan = undefined
       this.pendingPinchScale = undefined
   }

   calcOffset(): void {
       let rect = this.canvas.getBoundingClientRect()
       this.offsetX = -rect.x
       this.offsetY = -rect.y
   }

   mousezoom(delta: number, event: any): void {

        if (this.meta.scrollLock) return

        // TODO: for mobile
        if (this.wmode !== 'pass') {
            if (this.wmode === 'click' && !(this.oldMeta as any).activated) {
                return
            }
            event.originalEvent.preventDefault()
            event.preventDefault()
        }

        event.deltaX = event.deltaX || Utils.getDeltaX(event)
        event.deltaY = event.deltaY || Utils.getDeltaY(event)

        let updated = false
        if (Math.abs(event.deltaX) > 0) {
            this.trackpad = true
            if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
                delta *= 0.1
            }
            this.trackpadScroll(event)
            updated = true
        }

        if (this.trackpad) delta *= 0.032

        delta = Utils.smartWheel(delta)

        const dpr = window.devicePixelRatio ?? 1;

        // TODO: mouse zooming is a little jerky,
        // needs to follow f(mouse_wheel_speed) and
        // if speed is low, scroll shoud be slower
        let data = this.hub.mainOv.dataSubset
        if (delta < 0 && data.length <= this.MIN_ZOOM) return
        if (delta > 0 && data.length > this.MAX_ZOOM) return
        let k = this.interval / 1000
        let diff = delta * k * data.length
        let tl = this.props.config.ZOOM_MODE === 'tl'
        if (event.originalEvent.ctrlKey || tl) {
            let offset = event.originalEvent.offsetX
            let diff1 = offset / (this.canvas.width/dpr-1) * diff
            let diff2 = diff - diff1
            this.range[0] -= diff1
            this.range[1] += diff2
        } else {
            this.range[0] -= diff
        }

        if (tl) {
            let offset = event.originalEvent.offsetY
            let diff1 = offset / (this.canvas.height/dpr-1) * 2
            let diff2 = 2 - diff1
            let z = diff / (this.range[1] - this.range[0])
            //rezoom_range(z, diff_x, diff_y)
            // TODO: ?implement
            this.events.emit('rezoom-range', {
                gridId: this.gridId, z, diff1, diff2
            })
        }
        // TODO: fix doulbe updates (only on120hz macbook)
        /*if (!updated)*/ this.changeRange()

    }

    mousedrag(x: number, y: number, deferChange = false): void {

        if (this.meta.scrollLock) return

        let dt = this.drug!.t * (this.drug!.x - x) / this.layout.width
        let d$ = this.layout.$hi - this.layout.$lo
        d$ *= (this.drug!.y - y) / this.layout.height
        let offset = this.drug!.o + d$
        let ls = this.layout.settings.logScale

        var range: number[] | undefined
        if (ls && this.drug!.y_r) {
            let dy = this.drug!.y - y
            range = this.drug!.y_r.slice()
            range[0] = math.exp((0 - this.drug!.B + dy) /
                this.layout.A)
            range[1] = math.exp(
                (this.layout.height - this.drug!.B + dy) /
                this.layout.A)
        }

        let scaleId = this.layout.scaleIndex
        let yTransform = this.meta.getYtransform(this.gridId, scaleId)
        if (this.drug!.y_r && yTransform &&
            !yTransform.auto) {
            this.events.emit('sidebar-transform', {
                gridId: this.gridId,
                scaleId: scaleId,
                range: ls ? (range || this.drug!.y_r) : [
                    this.drug!.y_r[0] - offset,
                    this.drug!.y_r[1] - offset,
                ]
            })
        }

        this.range[0] = this.drug!.r[0] + dt
        this.range[1] = this.drug!.r[1] + dt

        if (!deferChange) this.changeRange()

    }

    pinchZoom(scale: number, deferChange = false): void {

        if (this.meta.scrollLock) return

        let data = this.hub.mainOv.dataSubset

        if (scale > 1 && data.length <= this.MIN_ZOOM) return
        if (scale < 1 && data.length > this.MAX_ZOOM) return

        let t = this.pinch!.t
        let nt = t * 1 / scale

        this.range[0] = this.pinch!.r[0] - (nt - t) * 0.5
        this.range[1] = this.pinch!.r[1] + (nt - t) * 0.5

        if (!deferChange) this.changeRange()

    }

    trackpadScroll(event: any): void {

        if (this.meta.scrollLock) return

        let dt = this.range[1] - this.range[0]

        this.range[0] += event.deltaX * dt * 0.011
        this.range[1] += event.deltaX * dt * 0.011

        this.changeRange()


    }

    changeRange(): void {

        // TODO: better way to limit the view. Problem:
        // when you are at the dead end of the data,
        // and keep scrolling,
        // the chart continues to scale down a little.
        // Solution: I don't know yet

        let data = this.hub.mainOv.data
        if (!this.range.length || data.length < 2) return

        let l = data.length - 1
        let range = this.range
        let layout = this.layout

        range[0] = Utils.clamp(
            range[0],
            -Infinity,
            layout.ti(data[l][0], l) - this.interval * 5.5,
        )

        range[1] = Utils.clamp(
            range[1],
            layout.ti(data[0][0], 0) + this.interval * 5.5,
            Infinity
        )

        this.events.emit('range-changed', range)
    }

    // Propagate mouse event to overlays
    propagate(name: string, event: any): void {
        this.events.emitSpec(this.gridUpdId, 'propagate', {
            name, event
        })
    }

    destroy(): void {
        if (!this.canvas) return
        if (typeof this.canvas.removeEventListener !== 'function') return
        let rm = this.canvas.removeEventListener.bind(this.canvas)
        rm("gesturestart", this.gesturestart as any)
        rm("gesturechange", this.gesturechange as any)
        rm("gestureend", this.gestureend as any)
        if (this.mc) this.mc.destroy()
        if (this.hm) this.hm.unwheel()
        if (this.touchRafId !== null) {
            cancelAnimationFrame(this.touchRafId)
            this.touchRafId = null
        }
        this.mouseEvents('removeEventListener')
    }

}
