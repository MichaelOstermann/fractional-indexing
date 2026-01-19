import { describe, expect, it } from "vitest"
import { FI } from "../src"

describe("FI.between", () => {
    describe("basic operations", () => {
        it("returns 'a0' for first key", () => {
            expect(FI.between(null, null)).toBe("a0")
        })

        it("increments integer when appending", () => {
            expect(FI.between("a0", null)).toBe("a1")
            expect(FI.between("a1", null)).toBe("a2")
            expect(FI.between("az", null)).toBe("b00")
        })

        it("decrements integer when prepending", () => {
            expect(FI.between(null, "a1")).toBe("a0")
            expect(FI.between(null, "a0")).toBe("Zz")
            expect(FI.between(null, "b00")).toBe("az")
        })

        it("finds midpoint between two keys", () => {
            const mid = FI.between("a0", "a2")
            expect(mid).toBe("a1")
            expect(mid > "a0").toBe(true)
            expect(mid < "a2").toBe(true)
        })

        it("uses fractional part when integers are adjacent", () => {
            const mid = FI.between("a0", "a1")
            expect(mid > "a0").toBe(true)
            expect(mid < "a1").toBe(true)
            expect(mid.startsWith("a0")).toBe(true)
            expect(mid.length).toBeGreaterThan(2)
        })
    })

    describe("correctness invariants", () => {
        it("result is always strictly between a and b", () => {
            const testCases: [string | null, string | null][] = [
                [null, null],
                ["a0", null],
                [null, "a0"],
                ["a0", "a5"],
                ["a0", "a1"],
                ["az", "b00"],
                ["Zz", "a0"],
                ["a0V", "a0W"],
            ]

            for (const [a, b] of testCases) {
                const result = FI.between(a, b)
                if (a !== null) {
                    expect(result > a, `${result} should be > ${a}`).toBe(true)
                }
                if (b !== null) {
                    expect(result < b, `${result} should be < ${b}`).toBe(true)
                }
            }
        })

        it("produces deterministic results", () => {
            const pairs: [string | null, string | null][] = [
                [null, null],
                ["a0", null],
                [null, "a5"],
                ["a0", "az"],
                ["a0", "a1"],
            ]

            for (const [a, b] of pairs) {
                const r1 = FI.between(a, b)
                const r2 = FI.between(a, b)
                expect(r1).toBe(r2)
            }
        })

        it("all generated keys are lexicographically sortable", () => {
            const keys: string[] = []
            let key: string | null = null

            // Generate 100 sequential keys
            for (let i = 0; i < 100; i++) {
                key = FI.between(key, null)
                keys.push(key)
            }

            // Verify they're already sorted
            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)
        })
    })

    describe("error handling", () => {
        it("throws when a >= b", () => {
            expect(() => FI.between("a5", "a5")).toThrow("FI.between(a, b):")
            expect(() => FI.between("a5", "a0")).toThrow("FI.between(a, b):")
            expect(() => FI.between("b00", "az")).toThrow("FI.between(a, b):")
        })
    })

    describe("head character transitions", () => {
        it("handles positive integer overflow (az → b00)", () => {
            const result = FI.between("az", null)
            expect(result).toBe("b00")
            expect(result > "az").toBe(true)
        })

        it("handles positive integer underflow (b00 → az)", () => {
            const result = FI.between(null, "b00")
            expect(result).toBe("az")
            expect(result < "b00").toBe(true)
        })

        it("handles crossing from positive to negative (a0 → Zz)", () => {
            const result = FI.between(null, "a0")
            expect(result).toBe("Zz")
            expect(result < "a0").toBe(true)
        })

        it("handles crossing from negative to positive (Zz → a0)", () => {
            const result = FI.between("Zz", null)
            expect(result).toBe("a0")
            expect(result > "Zz").toBe(true)
        })

        it("handles negative integer decrement (Z0 → Yzz)", () => {
            const result = FI.between(null, "Z0")
            expect(result).toBe("Yzz")
            expect(result < "Z0").toBe(true)
        })

        it("handles multi-level head transitions", () => {
            // bzz → c000
            expect(FI.between("bzz", null)).toBe("c000")

            // c000 → bzz
            expect(FI.between(null, "c000")).toBe("bzz")

            // Y00 → Xzzz
            expect(FI.between(null, "Y00")).toBe("Xzzz")
        })
    })

    describe("fractional part handling", () => {
        it("uses fractional midpoint when integers are adjacent", () => {
            const mid = FI.between("a0", "a1")
            expect(mid.startsWith("a0")).toBe(true)
            expect(mid.length).toBeGreaterThan(2)
        })

        it("finds midpoint in existing fractional parts", () => {
            const mid = FI.between("a0G", "a0W")
            expect(mid > "a0G").toBe(true)
            expect(mid < "a0W").toBe(true)
        })

        it("prepends before key with fractional part", () => {
            const mid = FI.between(null, "a0V")
            expect(mid < "a0V").toBe(true)
            expect(mid.startsWith("a0")).toBe(true)
        })

        it("handles deeply nested fractional keys", () => {
            let a = "a0"
            const b = "a1"

            for (let i = 0; i < 100; i++) {
                const mid = FI.between(a, b)
                expect(mid > a).toBe(true)
                expect(mid < b).toBe(true)
                a = mid
            }
        })
    })

    describe("key length growth", () => {
        it("append: key length grows logarithmically", () => {
            let key: string | null = null
            const lengths: number[] = []

            for (let i = 0; i < 10000; i++) {
                key = FI.between(key, null)
                if (i % 1000 === 999) {
                    lengths.push(key.length)
                }
            }

            // After 10000 appends, key should be around 4 chars (log62(10000) ≈ 2.2, plus head)
            // Being generous: should be < 10 chars
            expect(key!.length).toBeLessThan(10)

            // Growth should be sublinear (logarithmic)
            // Each 10x more items should add roughly 1 char
            for (let i = 1; i < lengths.length; i++) {
                expect(lengths[i]! - lengths[i - 1]!).toBeLessThanOrEqual(2)
            }
        })

        it("prepend: key length grows logarithmically", () => {
            let key: string | null = null
            const lengths: number[] = []

            for (let i = 0; i < 10000; i++) {
                key = FI.between(null, key)
                if (i % 1000 === 999) {
                    lengths.push(key.length)
                }
            }

            // Same expectations as append
            expect(key!.length).toBeLessThan(10)

            for (let i = 1; i < lengths.length; i++) {
                expect(lengths[i]! - lengths[i - 1]!).toBeLessThanOrEqual(2)
            }
        })

        it("between adjacent: key length grows linearly (worst case)", () => {
            let a = FI.between(null, null)
            const b = FI.between(a, null)

            // Repeatedly insert between a and current midpoint
            for (let i = 0; i < 1000; i++) {
                const mid = FI.between(a, b)
                expect(mid > a).toBe(true)
                expect(mid < b).toBe(true)
                a = mid
            }

            // After 1000 splits toward b, length grows but should be manageable
            // Each split adds roughly 1 char in the worst case
            // With 62-char alphabet, we get ~5-6 splits per char
            expect(a.length).toBeLessThan(200)
        })

        it("random inserts: maintains reasonable key lengths", () => {
            const keys = ["a0"]

            for (let i = 0; i < 1000; i++) {
                // Pick random position to insert
                const pos = Math.floor(Math.random() * (keys.length + 1))
                const before = pos > 0 ? keys[pos - 1]! : null
                const after = pos < keys.length ? keys[pos]! : null

                const newKey = FI.between(before, after)

                // Verify ordering
                if (before) expect(newKey > before).toBe(true)
                if (after) expect(newKey < after).toBe(true)

                keys.splice(pos, 0, newKey)
            }

            // Check all keys are sorted
            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)

            // Check max key length is reasonable
            const maxLength = Math.max(...keys.map(k => k.length))
            expect(maxLength).toBeLessThan(50)
        })
    })

    describe("stress tests", () => {
        it("handles 50000 sequential appends", () => {
            let key: string | null = null
            let prev: string | null = null

            for (let i = 0; i < 50000; i++) {
                key = FI.between(key, null)
                if (prev !== null) {
                    expect(key > prev).toBe(true)
                }
                prev = key
            }

            // Final key should still be reasonably short
            expect(key!.length).toBeLessThan(10)
        })

        it("handles 50000 sequential prepends", () => {
            let key: string | null = null
            let prev: string | null = null

            for (let i = 0; i < 50000; i++) {
                key = FI.between(null, key)
                if (prev !== null) {
                    expect(key < prev).toBe(true)
                }
                prev = key
            }

            expect(key!.length).toBeLessThan(10)
        })

        it("handles alternating append/prepend", () => {
            const keys: string[] = [FI.between(null, null)]

            for (let i = 0; i < 50000; i++) {
                if (i % 2 === 0) {
                    // Append
                    const newKey = FI.between(keys[keys.length - 1]!, null)
                    keys.push(newKey)
                }
                else {
                    // Prepend
                    const newKey = FI.between(null, keys[0]!)
                    keys.unshift(newKey)
                }
            }

            // Verify all keys are sorted
            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)

            // Check lengths are reasonable
            const maxLength = Math.max(...keys.map(k => k.length))
            expect(maxLength).toBeLessThan(10)
        })

        it("pathological case: always split toward one side", () => {
            const a = FI.between(null, null)
            const b = FI.between(a, null)
            let current = a

            // Always insert right after 'a' (worst case for key growth)
            for (let i = 0; i < 10000; i++) {
                const mid = FI.between(current, b)
                expect(mid > current).toBe(true)
                expect(mid < b).toBe(true)
                current = mid
            }

            // With base-62, should add roughly 1 char per ~5-6 splits
            // 10000 splits → ~1700 chars max, but algorithm should do better
            expect(current.length).toBeLessThan(2000)
        })
    })

    describe("specific key formats", () => {
        it("generates valid key structure", () => {
            const keys = [
                FI.between(null, null),
                FI.between("a0", null),
                FI.between("az", null),
                FI.between(null, "a0"),
                FI.between("a0", "a1"),
            ]

            for (const key of keys) {
                // Key should only contain valid characters
                expect(key).toMatch(/^[0-9A-Z]+$/i)

                // First char should be a valid head (a-z or A-Z)
                expect(key[0]).toMatch(/^[A-Z]$/i)
            }
        })

        it("integer part has correct length for head", () => {
            // 'a' head = 1 body char, total 2
            expect(FI.between(null, null)).toBe("a0")
            expect(FI.between(null, null).length).toBe(2)

            // Generate a 'b' head key (3 chars total)
            // Need 63 iterations: first gives "a0", then 62 more to overflow to "b00"
            let key: string | null = null
            for (let i = 0; i < 63; i++) {
                key = FI.between(key, null)
            }
            expect(key![0]).toBe("b")
            expect(key!.slice(0, 3)).toMatch(/^b[0-9A-Za-z]{2}$/)
        })
    })

    describe("interleaved operations", () => {
        it("maintains ordering after complex sequence", () => {
            const keys: string[] = []

            // Start with some sequential keys
            let k: string | null = null
            for (let i = 0; i < 10; i++) {
                k = FI.between(k, null)
                keys.push(k)
            }

            // Insert between various pairs
            const insertions = [
                [0, 1],
                [5, 6],
                [8, 9],
                [0, 1],
                [0, 1],
            ]

            for (const [i, j] of insertions) {
                const newKey = FI.between(keys[i!]!, keys[j!]!)
                expect(newKey > keys[i!]!).toBe(true)
                expect(newKey < keys[j!]!).toBe(true)
                keys.splice(j!, 0, newKey)
            }

            // Final check: all keys sorted
            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)
        })

        it("handles inserting at same position repeatedly", () => {
            const keys = [FI.between(null, null)]
            keys.push(FI.between(keys[0]!, null))

            // Always insert between first two keys
            for (let i = 0; i < 100; i++) {
                const newKey = FI.between(keys[0]!, keys[1]!)
                expect(newKey > keys[0]!).toBe(true)
                expect(newKey < keys[1]!).toBe(true)
                keys.splice(1, 0, newKey)
            }

            // Verify order
            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)
        })
    })

    describe("boundary values", () => {
        it("works at positive/negative boundary", () => {
            // Around the Zz/a0 boundary
            const negativeKey = FI.between(null, "a0")
            expect(negativeKey).toBe("Zz")

            const positiveKey = FI.between("Zz", null)
            expect(positiveKey).toBe("a0")

            // Between them
            const mid = FI.between("Zz", "a0")
            expect(mid > "Zz").toBe(true)
            expect(mid < "a0").toBe(true)
        })

        it("handles keys deep in negative territory", () => {
            let key: string | null = "a0"

            // Go into negative territory
            for (let i = 0; i < 100; i++) {
                key = FI.between(null, key)
            }

            expect(key < "a0").toBe(true)
            expect(key[0]).toMatch(/[A-Z]/)
        })

        it("handles mix of positive and negative keys", () => {
            const keys: string[] = []

            // Generate some negative keys
            let negKey: string | null = "a0"
            for (let i = 0; i < 50; i++) {
                negKey = FI.between(null, negKey)
                keys.push(negKey)
            }

            // Generate some positive keys
            let posKey: string | null = "a0"
            for (let i = 0; i < 50; i++) {
                posKey = FI.between(posKey, null)
                keys.push(posKey)
            }

            keys.push("a0") // Add the middle key

            // Sort and verify
            keys.sort()

            // All negative keys should come before a0
            const a0Index = keys.indexOf("a0")
            for (let i = 0; i < a0Index; i++) {
                expect(keys[i]! < "a0").toBe(true)
            }
            for (let i = a0Index + 1; i < keys.length; i++) {
                expect(keys[i]! > "a0").toBe(true)
            }
        })
    })
})
