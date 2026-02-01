declare module '@freecodecamp/strip-comments' {
    export default function strip(src: string): string
}

declare module 'hamsterjs' {
    export default function Hamster(element: HTMLElement): {
        wheel: (callback: (event: any, delta: number) => void) => void
        unwheel: () => void
    }
}

declare module './worker.js?worker&inline' {
    export default class WebWorker extends Worker {
        constructor()
    }
}

interface ImportMeta {
    glob: (pattern: string, options?: { eager?: boolean }) => Record<string, any>
}
