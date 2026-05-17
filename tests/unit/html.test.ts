import { describe, expect, it } from 'vitest'
import { sanitizeLegendHtml } from '../../src/stuff/html'

describe('legend HTML sanitizer', () => {
    it('keeps supported legend span markup', () => {
        const html = `
            <span style="color: #abcdef">
                <span style="margin-left: 3px;"></span>
                <span class="nvjs-ll-value">42</span>
            </span>
        `

        expect(sanitizeLegendHtml(html)).toContain('style="color: #abcdef"')
        expect(sanitizeLegendHtml(html)).toContain('style="margin-left: 3px"')
        expect(sanitizeLegendHtml(html)).toContain('class="nvjs-ll-value"')
        expect(sanitizeLegendHtml(html)).toContain('42')
    })

    it('removes executable tags, event handlers, and unsafe CSS', () => {
        const html = `
            <img src=x onerror="alert(1)">
            <script>alert(2)</script>
            <span onclick="alert(3)" style="background-image: url(javascript:alert(4)); color: red">
                Value
            </span>
        `

        const clean = sanitizeLegendHtml(html)

        expect(clean).not.toContain('<img')
        expect(clean).not.toContain('<script')
        expect(clean).not.toContain('onerror')
        expect(clean).not.toContain('onclick')
        expect(clean).not.toContain('javascript:')
        expect(clean).not.toContain('background-image')
        expect(clean).toContain('style="color: red"')
        expect(clean).toContain('Value')
    })
})
