const ALLOWED_TAGS = new Set(['SPAN'])
const ALLOWED_STYLE_PROPS = new Set(['color', 'margin-left', 'margin-right'])

function validClass(value: string): boolean {
    return /^[A-Za-z0-9_\-\s]+$/.test(value)
}

function validStyleValue(prop: string, value: string): boolean {
    if (prop === 'color') {
        return (
            /^#[0-9A-Fa-f]{3,8}$/.test(value) ||
            /^[A-Za-z]+$/.test(value) ||
            /^rgba?\(\s*[\d.\s%,]+\)$/.test(value) ||
            /^hsla?\(\s*[\d.\s%,]+\)$/.test(value)
        )
    }
    return /^-?\d+(\.\d+)?(px|em|rem|%)$/.test(value)
}

function sanitizeStyle(style: string): string {
    const out: string[] = []
    for (const part of style.split(';')) {
        const [rawProp, ...rawValue] = part.split(':')
        if (!rawProp || !rawValue.length) continue
        const prop = rawProp.trim().toLowerCase()
        const value = rawValue.join(':').trim()
        if (!ALLOWED_STYLE_PROPS.has(prop)) continue
        if (!validStyleValue(prop, value)) continue
        out.push(`${prop}: ${value}`)
    }
    return out.join('; ')
}

function sanitizeNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent || '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null
    }

    const el = node as Element
    const tagName = el.tagName.toUpperCase()
    const children = Array.from(el.childNodes).map(sanitizeNode).filter(Boolean) as Node[]

    if (!ALLOWED_TAGS.has(tagName)) {
        const fragment = document.createDocumentFragment()
        for (const child of children) fragment.appendChild(child)
        return fragment
    }

    const clean = document.createElement(tagName.toLowerCase())
    const className = el.getAttribute('class')
    if (className && validClass(className)) {
        clean.setAttribute('class', className)
    }

    const style = el.getAttribute('style')
    if (style) {
        const cleanStyle = sanitizeStyle(style)
        if (cleanStyle) clean.setAttribute('style', cleanStyle)
    }

    for (const child of children) clean.appendChild(child)
    return clean
}

function sanitizeLegendHtml(html: unknown): string {
    if (typeof document === 'undefined') return ''
    if (html == null) return ''

    const template = document.createElement('template')
    template.innerHTML = String(html)

    const fragment = document.createDocumentFragment()
    for (const child of Array.from(template.content.childNodes)) {
        const clean = sanitizeNode(child)
        if (clean) fragment.appendChild(clean)
    }

    const wrapper = document.createElement('div')
    wrapper.appendChild(fragment)
    return wrapper.innerHTML
}

export { sanitizeLegendHtml }
