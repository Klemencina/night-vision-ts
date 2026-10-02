import { describe, expect, it } from 'vitest'
import ParserIND from '../../../src/core/navy/parserInd'

describe('indicator section whitespace', () => {
    it.each(['[UPDATE]', '[ UPDATE ]', '[\tUPDATE\t]'])('separates code after %s', update => {
        const parser = new ParserIND('name=Test', `let value = 1\n${update}\nvalue += 2\n[ POST ]\nvalue += 3`)
        const result = new Function(`${parser.init}\n${parser.update}\n${parser.post}\nreturn value`)()
        expect(result).toBe(6)
    })
})
