
// Parser tools

import strip from '@freecodecamp/strip-comments'

type QuotePairs = [number, number][]
type CharCount = { [key: string]: number }

function decomment(src: string): string {
    // TODO: incorrectly parsing comments like: /*  /*  */
    return strip(src)
}

// Mask comments inside all strings
// (needed b/c there could  be comment symbols // & /*)
function maskStrings(src: string): string {
    let quotes = findStrings(src)
    for (var q of quotes) {
        let tmp = src.slice(0, q[0] + 1)
        tmp += src.slice(q[0] + 1, q[1])
            .replaceAll('/*', '[!C~1!]')
            .replaceAll('//', '[!C~2!]')
        tmp += src.slice(q[1])
        src = tmp
    }
    return src
}

// Unmask comment symbols back
function unmaskStrings(src: string): string {
    return src
        .replaceAll('[!C~1!]', '/*')
        .replaceAll('[!C~2!]', '//')
}

// Find all strings (``, '' or "")
function findStrings(src: string): QuotePairs {
    let count: CharCount = { '\'' : 0, '"' : 0, '`' : 0 }
    let pairs: QuotePairs = []
    let pair: [number, number] | null = null

    for (var i = 0; i < src.length; i++) {
        for (var type in count) {
            if (src[i] === type && src[i-1] !== '\\') {
                count[type]++
                if (!pair) pair = [i, 0]
            }

            if (src[i] === type && src[i-1] !== '\\' &&
                i > pair![0] ) {
                count[type] = 0
                if (pair && Object.values(count).every(x => !x)) {
                    pair[1] = i
                    pairs.push(pair)
                    pair = null
                }
            }

            if (count[type] < 0) {
                throw new Error(`Missing quote ${type}`)
            }
        }
    }

    if (pair !== null) {
        throw new Error(`Missing quote: ${JSON.stringify(count)}`)
    }

    return pairs
}

// Hide/show RegExp content with base64
// (needed b/c there could be comment symbols // & /*)
function maskRegex(src: string, f: (s: string) => string = btoa): string {
    // Regex
    let rex = /\/([^*\/]?.+)\//g
    let m: RegExpExecArray | null
    do {
        m = rex.exec(src)
        if (m) {
            let length = m[0].length
            if (m[1].slice(-1) === '*') {
                length--
                m[1] = m[1].slice(0, -1)
            }
            let tmp = src.slice(0, m.index + 1)
            let r = f(m[1])
            tmp += r + src.slice(m.index + length - 1)
            src = tmp
            rex.lastIndex = m.index + r.length
        }
    } while (m)
    return src
}

function findClosingBracket(src: string, startPos: number, file: string, btype = '{}'): number {
    let open = btype[0]
    let close = btype[1]

    let count: CharCount = { '\'' : 0, '"' : 0, '`' : 0 }
    let count2 = 0
    let pairs: QuotePairs = []
    let pair: [number, number] | null = null

    for (var i = startPos; i < src.length; i++) {
        for (var type in count) {
            if (src[i] === type && src[i-1] !== '\\') {
                count[type]++
                if (!pair) pair = [i, 0]
            }

            if (src[i] === type && src[i-1] !== '\\' &&
                i > pair![0] ) {
                count[type] = 0
                if (pair && Object.values(count).every(x => !x)) {
                    pair[1] = i
                    pairs.push(pair)
                    pair = null
                }
            }

            if (count[type] < 0) {
                throw new Error(`Missing quote ${type} in ${file}`)
            }
        }

        // Don't count brackets inside strings
        let sum = count['\''] + count['"'] + count['`']
        if (sum === 0) {
            if (src[i] === open) count2++
            if (src[i] === close) count2--

            if (count2 === 0) break // Closing bracket
        }
    }

    if (count2 !== 0) {
        throw new Error(`Missing bracket in ${file}: ${btype}`)
    }

    if (pair !== null) {
        throw new Error(`Missing quote in ${file}: ${JSON.stringify(count)}`)
    }

    return i
}

// Extracting 'static' function from a script
// Blame GPT4 for any errors
function extractStaticBlocks(script: string): string {
    let matches: string[] = [];
    let currentIndex = 0;

    while (currentIndex < script.length) {
        let staticIndex = script.indexOf('static', currentIndex);
        if (staticIndex === -1) break;

        let arrowIndex = script.indexOf('=>', staticIndex);
        if (arrowIndex === -1) break;

        // Adjust currentIndex to the character after '=>' and trim whitespaces.
        currentIndex = arrowIndex + 2;
        while ([' ', '\t', '\n', '\r'].includes(script[currentIndex])) {
            currentIndex++;
        }

        let nextChar = script[currentIndex];

        if (['{', '[', '('].includes(nextChar)) {
            let closingIndex: number;
            const bracketMap: { [key: string]: string } = { '{': '}', '[': ']', '(': ')' }
            try {
                closingIndex = findClosingBracket(script, currentIndex, 'script', nextChar + bracketMap[nextChar]);
            } catch (error) {
                console.error(error);
                continue;
            }
            matches.push(script.slice(staticIndex, closingIndex + 1).trim());
            currentIndex = closingIndex + 1; // update the currentIndex to the character after the closing bracket
        } else {
            let newLineIndex = script.indexOf('\n', currentIndex);
            matches.push(script.slice(staticIndex, newLineIndex !== -1 ? newLineIndex : undefined).trim());
        }
    }

    return matches.join('\n');
}

export default {
    maskStrings, unmaskStrings, findStrings, maskRegex,
    decomment, findClosingBracket, extractStaticBlocks
}
