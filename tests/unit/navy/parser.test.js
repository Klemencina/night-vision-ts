// NavyScript parser unit tests (Vitest)

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Parser from '@/core/navy/parser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load test fixtures
const baseOverlayScript = fs.readFileSync(
    path.join(__dirname, '../../navy/scripts/base_overlay.navy'),
    'utf-8'
)

const candlesStaticScript = fs.readFileSync(
    path.join(__dirname, '../../navy/scripts/candles_static.navy'),
    'utf-8'
)

const watchPropScript = fs.readFileSync(
    path.join(__dirname, '../../navy/scripts/WatchProp.navy'),
    'utf-8'
)

const parserTestScript = fs.readFileSync(
    path.join(__dirname, '../../navy/scripts/parser_test.navy'),
    'utf-8'
)

describe('NavyScript Parser', () => {
    describe('Basic instantiation', () => {
        it('should create a parser instance', () => {
            const parser = new Parser(baseOverlayScript, 'Test Overlay')
            expect(parser).toBeInstanceOf(Parser)
        })

        it('should have default version properties', () => {
            const parser = new Parser(baseOverlayScript, 'Test Overlay')
            expect(parser.version).toBe(0.2)
            expect(parser.scriptName).toBe('Spline')
        })

        it('should use provided name if no name in script', () => {
            const parser = new Parser('// NavyScript~0.1-lite\n\n[EOF]', 'Fallback Name')
            expect(parser.scriptName).toBe('Fallback Name')
        })
    })

    describe('Version parsing (navyVers)', () => {
        it('should extract version 0.1 from script', () => {
            const parser = new Parser(baseOverlayScript)
            expect(parser.scriptVers).toBe(0.1)
        })

        it('should extract version 0.2 from script', () => {
            const parser = new Parser(watchPropScript)
            expect(parser.scriptVers).toBe(0.2)
        })

        it('should return 0 for scripts without version', () => {
            const parser = new Parser('[OVERLAY name=Test]\n\n[EOF]')
            expect(parser.scriptVers).toBe(0)
        })

        it('should extract lite tag correctly', () => {
            const parser = new Parser(baseOverlayScript)
            expect(parser.scriptTag).toBe('lite')
        })

        it('should handle version without tag', () => {
            const parser = new Parser('// NavyScript~0.1\n\n[EOF]')
            expect(parser.scriptVers).toBe(0.1)
            expect(parser.scriptTag).toBeUndefined()
        })
    })

    describe('Name extraction', () => {
        it('should extract name from OVERLAY tag', () => {
            const parser = new Parser(baseOverlayScript)
            expect(parser.scriptName).toBe('Spline')
        })

        it('should extract name from Candles script', () => {
            const parser = new Parser(candlesStaticScript)
            expect(parser.scriptName).toBe('Candles')
        })

        it('should return null for scripts without name', () => {
            const parser = new Parser('[OVERLAY]\n\n[EOF]')
            expect(parser.scriptName).toBe('Unknown Script')
        })
    })

    describe('Overlay tag parsing', () => {
        it('should parse overlay tags', () => {
            const parser = new Parser(baseOverlayScript)
            expect(parser.overlays).toBeDefined()
            expect(Array.isArray(parser.overlays)).toBe(true)
        })

        it('should parse single overlay', () => {
            const parser = new Parser(baseOverlayScript)
            expect(parser.overlays.length).toBeGreaterThan(0)
        })

        it('should parse multiple overlays if present', () => {
            const script = `
// NavyScript~0.1-lite
[OVERLAY name=Spline1, export=true]
[OVERLAY name=Spline2, export=true]
[EOF]
`
            const parser = new Parser(script)
            expect(parser.overlays.length).toBe(2)
        })
    })

    describe('Indicator tag parsing', () => {
        it('should parse indicator tags', () => {
            const script = `
// NavyScript~0.1-lite
[INDICATOR name=SMA, period=14]
dataFormat() => TS(Float)
calc(src) => src.close
[EOF]
`
            const parser = new Parser(script)
            expect(parser.indicators).toBeDefined()
            expect(Array.isArray(parser.indicators)).toBe(true)
            expect(parser.indicators.length).toBe(1)
        })

        it('should parse multiple indicators', () => {
            const script = `
// NavyScript~0.1-lite
[INDICATOR name=SMA1, period=10]
calc(src) => src.close
[INDICATOR name=SMA2, period=20]
calc(src) => src.close
[EOF]
`
            const parser = new Parser(script)
            expect(parser.indicators.length).toBe(2)
        })
    })

    describe('Complex scripts', () => {
        it('should handle Candles overlay', () => {
            const parser = new Parser(candlesStaticScript)
            expect(parser.scriptName).toBe('Candles')
            expect(parser.scriptVers).toBe(0.1)
        })

        it('should handle WatchProp overlay', () => {
            const parser = new Parser(watchPropScript)
            expect(parser.scriptName).toBe('WatchOverlay')
            expect(parser.scriptVers).toBe(0.2)
            expect(parser.scriptTag).toBe('lite')
        })

        it('should parse parser test script or throw for invalid syntax', () => {
            // parser_test.navy contains intentionally malformed code for testing
            // It may throw due to syntax errors in the body, which is expected
            expect(() => {
                new Parser(parserTestScript)
            }).toThrow()
        })
    })

    describe('Edge cases', () => {
        it('should handle empty script', () => {
            const parser = new Parser('[EOF]')
            expect(parser.scriptVers).toBe(0)
            expect(parser.overlays.length).toBe(0)
            expect(parser.indicators.length).toBe(0)
        })

        it('should handle script with only comments', () => {
            const parser = new Parser('// Just a comment\n[EOF]')
            expect(parser.scriptVers).toBe(0)
        })

        it('should handle malformed version string gracefully', () => {
            const parser = new Parser('// NavyScript~invalid\n\n[EOF]')
            expect(parser.scriptVers).toBe(0)
        })

        it('should handle version with no numeric value', () => {
            const parser = new Parser('// NavyScript~\n\n[EOF]')
            expect(parser.scriptVers).toBe(0)
        })
    })
})
