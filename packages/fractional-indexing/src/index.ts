/**
 * Fractional indexing with logarithmic growth (based on dgreensp's algorithm).
 *
 * KEY STRUCTURE
 * =============
 * Each key has two parts: an "integer" part and an optional "fractional" part.
 *
 *   key = [integer][fractional]
 *
 * The INTEGER part consists of:
 *   - A "head" character (1 char) that determines how many "body" chars follow
 *   - A "body" (variable length) that encodes the actual value
 *
 *   integer = [head][body]
 *
 * Examples:
 *   "a5"     → head='a', body="5"      → integer="a5", fractional=""
 *   "b12"    → head='b', body="12"     → integer="b12", fractional=""
 *   "c000X"  → head='c', body="000"    → integer="c000", fractional="X"
 *   "a0V"    → head='a', body="0"      → integer="a0", fractional="V"
 *
 * HEAD CHARACTER ENCODING
 * =======================
 * The head character determines the body length:
 *
 * Positive integers (a-z):
 *   'a' → 1 body char:  a0, a1, ..., az         (62 values)
 *   'b' → 2 body chars: b00, b01, ..., bzz      (62² = 3,844 values)
 *   'c' → 3 body chars: c000, c001, ..., czzz   (62³ = 238,328 values)
 *   ...and so on up to 'z' (26 body chars)
 *
 * Negative integers (A-Z, ordered before positive):
 *   'Z' → 1 body char:  Z0, Z1, ..., Zz         (62 values, just before a0)
 *   'Y' → 2 body chars: Y00, Y01, ..., Yzz      (62² = 3,844 values, before Z0)
 *   'X' → 3 body chars: X000, X001, ..., Xzzz   (62³ = 238,328 values, before Y00)
 *   ...and so on down to 'A' (26 body chars)
 *
 * Full ordering (lexicographic string comparison):
 *   A000...0 < ... < Xzzz < Y00 < ... < Yzz < Z0 < ... < Zz < a0 < ... < az < b00 < ... < bzz < c000 < ...
 *
 * WHY THIS DESIGN?
 * ================
 * This encoding gives O(log n) key growth for sequential operations:
 * - Appending n items: keys grow as log₆₂(n)
 * - Prepending n items: same, using negative integers
 * - Inserting between: uses fractional part to subdivide
 *
 * The fractional part allows infinite subdivision between any two adjacent
 * integers without needing to renumber existing keys.
 */

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const BASE = 62
const CHAR_MIN = "0"
const CHAR_MAX = "z"

function charToIndex(c: string): number {
    const code = c.charCodeAt(0)
    if (code <= 57) return code - 48
    if (code <= 90) return code - 55
    return code - 61
}

/**
 * Get the body length for an integer based on its head character.
 *
 * Examples:
 *   'a' → 1  (integers like "a0", "a5", "az")
 *   'b' → 2  (integers like "b00", "b5X", "bzz")
 *   'c' → 3  (integers like "c000", "c123", "czzz")
 *   'Z' → 1  (integers like "Z0", "Zz")
 *   'Y' → 2  (integers like "Y00", "Yzz")
 */
function getIntegerLength(head: string): number {
    const code = head.charCodeAt(0)
    if (code >= 97) return code - 96
    return 91 - code
}

/**
 * Extract the integer part (head + body) from a key.
 *
 * Examples:
 *   "a5"    → "a5"   (head='a' means 1 body char, so integer is chars 0-1)
 *   "b12"   → "b12"  (head='b' means 2 body chars, so integer is chars 0-2)
 *   "c000X" → "c000" (head='c' means 3 body chars, so integer is chars 0-3)
 *   "a0V"   → "a0"   (head='a' means 1 body char, so integer is chars 0-1)
 */
function getIntegerPart(key: string): string {
    return key.slice(0, getIntegerLength(key[0]!) + 1)
}

/**
 * Extract the fractional part (everything after the integer) from a key.
 *
 * Examples:
 *   "a5"    → ""    (no fractional part)
 *   "b12"   → ""    (no fractional part)
 *   "c000X" → "X"   (fractional part is "X")
 *   "a0V8"  → "V8"  (fractional part is "V8")
 */
function getFractionalPart(key: string): string {
    return key.slice(getIntegerLength(key[0]!) + 1)
}

/**
 * Increment an integer to the next value in sort order.
 *
 * Within the same head, increments the body like a base-62 number:
 *   a0 → a1 → a2 → ... → az
 *
 * When body overflows, moves to next head (longer body):
 *   az → b00  (head 'a' with body "z" overflows to head 'b' with body "00")
 *   bzz → c000
 *
 * For negative integers, incrementing moves toward positive:
 *   Z0 → Z1 → ... → Zz → a0  (Zz is the last negative, a0 is first positive)
 *   Yzz → Z0  (Y-series ends, Z-series begins)
 */
function incrementInteger(int: string): string {
    const head = int[0]!
    const chars = int.slice(1)

    const incremented = incrementChars(chars)
    if (incremented !== null) {
        return head + incremented
    }

    const headCode = head.charCodeAt(0)
    if (headCode >= 97 && headCode < 122) {
        return String.fromCharCode(headCode + 1) + CHAR_MIN.repeat(chars.length + 1)
    }
    if (headCode === 122) {
        throw new Error("FI.between(a, b): Reached maximum index")
    }
    if (headCode === 90) {
        return "a0"
    }
    return String.fromCharCode(headCode + 1) + CHAR_MIN.repeat(chars.length - 1)
}

/**
 * Decrement an integer to the previous value in sort order.
 *
 * Within the same head, decrements the body like a base-62 number:
 *   az → ay → ... → a1 → a0
 *
 * When body underflows, moves to previous head:
 *   b00 → az  (head 'b' with body "00" underflows to head 'a' with body "z")
 *   c000 → bzz
 *
 * Crossing from positive to negative:
 *   a0 → Zz  (first positive decrements to last negative)
 *
 * For negative integers, decrementing moves away from zero (longer body):
 *   Z0 → Yzz  (Z-series underflows to Y-series)
 *   Y00 → Xzzz
 */
function decrementInteger(int: string): string {
    const head = int[0]!
    const chars = int.slice(1)

    const decremented = decrementChars(chars)
    if (decremented !== null) {
        return head + decremented
    }

    const headCode = head.charCodeAt(0)
    if (headCode > 97 && headCode <= 122) {
        return String.fromCharCode(headCode - 1) + CHAR_MAX.repeat(chars.length - 1)
    }
    if (headCode === 97) {
        return "Zz"
    }
    if (headCode === 65) {
        throw new Error("FI.between(a, b): Reached minimum index")
    }
    return String.fromCharCode(headCode - 1) + CHAR_MAX.repeat(chars.length + 1)
}

/**
 * Increment a string as a base-62 number. Returns null on overflow.
 *
 * Examples:
 *   "0"  → "1"
 *   "9"  → "A"   (9 is index 9, A is index 10)
 *   "z"  → null  (overflow, z is the max single char)
 *   "00" → "01"
 *   "0z" → "10"  (carry from rightmost position)
 *   "zz" → null  (overflow)
 */
function incrementChars(chars: string): string | null {
    const last = chars.length - 1
    const lastIdx = charToIndex(chars[last]!)

    if (lastIdx < BASE - 1) {
        return chars.slice(0, last) + CHARS[lastIdx + 1]
    }

    let result = CHAR_MIN
    for (let i = last - 1; i >= 0; i--) {
        const idx = charToIndex(chars[i]!) + 1
        if (idx < BASE) {
            return chars.slice(0, i) + CHARS[idx] + result
        }
        result = CHAR_MIN + result
    }

    return null
}

/**
 * Decrement a string as a base-62 number. Returns null on underflow.
 *
 * Examples:
 *   "1"  → "0"
 *   "A"  → "9"   (A is index 10, 9 is index 9)
 *   "0"  → null  (underflow)
 *   "01" → "00"
 *   "10" → "0z"  (borrow from left position)
 *   "00" → null  (underflow)
 */
function decrementChars(chars: string): string | null {
    const last = chars.length - 1
    const lastIdx = charToIndex(chars[last]!)

    if (lastIdx > 0) {
        return chars.slice(0, last) + CHARS[lastIdx - 1]
    }

    let result = CHAR_MAX
    for (let i = last - 1; i >= 0; i--) {
        const idx = charToIndex(chars[i]!) - 1
        if (idx >= 0) {
            return chars.slice(0, i) + CHARS[idx] + result
        }
        result = CHAR_MAX + result
    }

    return null
}

/**
 * Find an integer midpoint between a and b, or null if they are adjacent.
 *
 * Examples:
 *   ("a0", "a9") → "a4"  (midpoint in same head)
 *   ("a0", "a2") → "a1"
 *   ("a0", "a1") → null  (adjacent, no integer between them)
 *   ("a5", "b00") → "aV" (or similar, incrementing a5 until < b00)
 *   ("az", "b00") → null (adjacent across head boundary)
 */
function midpointInteger(a: string, b: string): string | null {
    if (a.length === b.length && a[0] === b[0]) {
        const aChars = a.slice(1)
        const bChars = b.slice(1)
        const mid = midpointChars(aChars, bChars)
        if (mid !== null) {
            return a[0] + mid
        }
        return null
    }

    const aNext = incrementInteger(a)
    if (aNext < b) {
        return aNext
    }
    return null
}

/**
 * Find midpoint between two equal-length strings. Returns null if adjacent.
 *
 * Works character by character from left to right:
 * - If chars are equal, copy and continue
 * - If chars differ by > 1, return the midpoint
 * - If chars are adjacent (differ by 1), try to find midpoint in remaining chars
 *
 * Examples:
 *   ("00", "09") → "04"
 *   ("00", "02") → "01"
 *   ("00", "01") → null  (adjacent)
 *   ("05", "15") → "0V"  (0 and 1 are adjacent, so look at "5" vs implicit "zzz...")
 */
function midpointChars(a: string, b: string): string | null {
    let result = ""
    for (let i = 0; i < a.length; i++) {
        const aIdx = charToIndex(a[i]!)
        const bIdx = charToIndex(b[i]!)

        if (aIdx === bIdx) {
            result += a[i]
            continue
        }

        const mid = (aIdx + bIdx) >> 1
        if (mid > aIdx) {
            return result + CHARS[mid]
        }

        result += a[i]
        const restMid = midpointCharsAfter(a.slice(i + 1))
        if (restMid !== null) {
            return result + restMid
        }
        return null
    }
    return null
}

/**
 * Find midpoint between a string and the maximum string of same length ("zzz...").
 *
 * Used when the main midpointChars finds adjacent chars - we then need to find
 * a midpoint between the rest of 'a' and the implicit maximum.
 *
 * Examples:
 *   "0" → "V"   (midpoint between "0" and "z")
 *   "5" → "Y"   (midpoint between "5" and "z")
 *   "z" → null  (already at max, no midpoint possible)
 *   "00" → "0V" (first char 0 < z, so midpoint is at first position)
 */
function midpointCharsAfter(a: string): string | null {
    for (let i = 0; i < a.length; i++) {
        const aIdx = charToIndex(a[i]!)
        if (aIdx < BASE - 1) {
            const mid = (aIdx + BASE) >> 1
            return a.slice(0, i) + CHARS[mid]
        }
    }
    return null
}

/**
 * Find a fractional string between a and b (or between a and infinity if b is null).
 *
 * Unlike midpointChars, this can extend the string length to find a midpoint,
 * so it always succeeds (never returns null).
 *
 * The algorithm treats missing chars as:
 * - For 'a': missing chars are "0" (the minimum)
 * - For 'b': missing chars are beyond "z" (the maximum), or if b is null, infinity
 *
 * Examples:
 *   ("", "V")     → "G"      (midpoint between "" and "V")
 *   ("V", "X")    → "W"      (midpoint between "V" and "X")
 *   ("V", "W")    → "VV"     (V and W are adjacent, so extend: midpoint of "V0" to "W0")
 *   ("V", null)   → "k"      (midpoint between "V" and infinity)
 *   ("", null)    → "V"      (midpoint between "" and infinity)
 */
function fractionalMidpoint(a: string, b: string | null): string {
    let result = ""
    let i = 0

    while (true) {
        const aIndex = i < a.length ? charToIndex(a[i]!) : 0
        const bIndex = b === null || i >= b.length ? BASE : charToIndex(b[i]!)

        const diff = bIndex - aIndex

        if (diff > 1) {
            return result + CHARS[(aIndex + bIndex) >> 1]
        }

        result += CHARS[aIndex]

        if (diff === 1) {
            b = null
        }

        i++
    }
}

const START_INTEGER = "a0"

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FI {
    export function between(
        a: string | null,
        b: string | null,
    ): string {
        if (a == null && b == null) return START_INTEGER

        if (a == null) {
            const bInt = getIntegerPart(b!)
            const bFrac = getFractionalPart(b!)
            if (bFrac) return bInt + fractionalMidpoint("", bFrac)
            return decrementInteger(bInt)
        }

        if (b == null) {
            return incrementInteger(getIntegerPart(a))
        }

        if (a >= b) {
            throw new Error(`FI.between(a, b): a "${a}" must be less than b "${b}"`)
        }

        const aInt = getIntegerPart(a)
        const bInt = getIntegerPart(b)

        if (aInt === bInt) {
            return aInt + fractionalMidpoint(getFractionalPart(a), getFractionalPart(b))
        }

        const midInt = midpointInteger(aInt, bInt)
        if (midInt !== null) return midInt

        return aInt + fractionalMidpoint(getFractionalPart(a), null)
    }

    export function betweenJittered(
        a: string | null,
        b: string | null,
        jitterBits: number,
    ): string {
        let lo = a
        let hi = b

        if (lo !== null && hi !== null && lo >= hi) {
            throw new Error(`FI.betweenJittered(a, b): a "${a}" must be less than b "${b}"`)
        }

        for (let i = 0; i < jitterBits; i++) {
            const mid = between(lo, hi)
            if (Math.random() < 0.5) hi = mid
            else lo = mid
        }

        return between(lo, hi)
    }

    export function validate(key: string): boolean {
        // Must not be empty
        if (!key) return false
        // Must have a valid head character (A-Z or a-z)
        const head = key.charCodeAt(0)
        if (!((head >= 65 && head <= 90) || (head >= 97 && head <= 122))) {
            return false
        }
        // Must have at least enough characters for the integer part (head + body)
        const expectedLength = getIntegerLength(key[0]!) + 1
        if (key.length < expectedLength) return false
        return true
    }
}
