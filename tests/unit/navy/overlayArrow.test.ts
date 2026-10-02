import { describe, expect, it } from 'vitest'
import ParserOV from '../../../src/core/navy/parserOv'

describe('overlay expression arrows', () => {
    it.each(['', ' '])('preserves expressions after => with spacing %j', space => {
        const parser = new ParserOV('name=Test', `legend()=>${space}null\nmeta()=>${space}42`)
        const overlay = parser.prefab({ lib: {} })
        expect(overlay.legend()).toBeNull()
        expect(overlay.meta()).toBe(42)
    })
})
