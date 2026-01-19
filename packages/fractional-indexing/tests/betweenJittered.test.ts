import { describe, expect, it } from "vitest"
import { FI } from "../src"

describe("FI.betweenJittered", () => {
    describe("basic invariants", () => {
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
                for (let i = 0; i < 10; i++) {
                    const result = FI.betweenJittered(a, b, 20)
                    if (a !== null) {
                        expect(result > a, `${result} should be > ${a}`).toBe(true)
                    }
                    if (b !== null) {
                        expect(result < b, `${result} should be < ${b}`).toBe(true)
                    }
                }
            }
        })

        it("all generated keys are lexicographically sortable", () => {
            const keys: string[] = []
            let key: string | null = null

            for (let i = 0; i < 100; i++) {
                key = FI.betweenJittered(key, null, 20)
                keys.push(key)
            }

            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)
        })
    })

    describe("jitter behavior", () => {
        it("produces varying results for same inputs (randomness)", () => {
            const results = new Set<string>()

            for (let i = 0; i < 100; i++) {
                results.add(FI.betweenJittered("a0", "a5", 20))
            }

            // With 20 jitter bits and 100 samples, we should get many unique values
            expect(results.size).toBeGreaterThan(50)
        })

        it("produces varying results even for adjacent keys", () => {
            const results = new Set<string>()

            for (let i = 0; i < 100; i++) {
                results.add(FI.betweenJittered("a0", "a1", 20))
            }

            expect(results.size).toBeGreaterThan(50)
        })

        it("produces varying results for null bounds", () => {
            const appendResults = new Set<string>()
            const prependResults = new Set<string>()
            const bothNullResults = new Set<string>()

            for (let i = 0; i < 100; i++) {
                appendResults.add(FI.betweenJittered("a5", null, 20))
                prependResults.add(FI.betweenJittered(null, "a5", 20))
                bothNullResults.add(FI.betweenJittered(null, null, 20))
            }

            expect(appendResults.size).toBeGreaterThan(50)
            expect(prependResults.size).toBeGreaterThan(50)
            expect(bothNullResults.size).toBeGreaterThan(50)
        })

        it("fewer jitter bits produce less variation", () => {
            const lowJitterResults = new Set<string>()
            const highJitterResults = new Set<string>()

            for (let i = 0; i < 100; i++) {
                lowJitterResults.add(FI.betweenJittered("a0", "a9", 5))
                highJitterResults.add(FI.betweenJittered("a0", "a9", 20))
            }

            // Lower jitter bits = fewer possible outcomes = less unique values
            expect(lowJitterResults.size).toBeLessThan(highJitterResults.size)
        })

        it("zero jitter bits behaves like regular between", () => {
            const a = "a0"
            const b = "a9"
            const expected = FI.between(a, b)

            for (let i = 0; i < 10; i++) {
                expect(FI.betweenJittered(a, b, 0)).toBe(expected)
            }
        })
    })

    describe("collision resistance", () => {
        it("concurrent insertions at same position rarely collide", () => {
            const concurrentOps = 100
            const trials = 10

            let collisions = 0

            for (let t = 0; t < trials; t++) {
                const results = new Set<string>()
                for (let i = 0; i < concurrentOps; i++) {
                    results.add(FI.betweenJittered("a0", "a1", 20))
                }
                collisions += concurrentOps - results.size
            }

            // With 20 jitter bits, expected collision rate for 100 ops is ~0.5%
            // Allow some margin: expect < 5% collision rate across all trials
            const totalOps = concurrentOps * trials
            const collisionRate = collisions / totalOps
            expect(collisionRate).toBeLessThan(0.05)
        })

        it("higher jitter bits reduce collision rate", () => {
            const concurrentOps = 50
            const trials = 20

            function measureCollisionRate(jitterBits: number): number {
                let collisions = 0
                for (let t = 0; t < trials; t++) {
                    const results = new Set<string>()
                    for (let i = 0; i < concurrentOps; i++) {
                        results.add(FI.betweenJittered("a0", "a1", jitterBits))
                    }
                    collisions += concurrentOps - results.size
                }
                return collisions / (concurrentOps * trials)
            }

            const lowJitterRate = measureCollisionRate(10)
            const highJitterRate = measureCollisionRate(25)

            // Higher jitter bits should have fewer collisions
            expect(highJitterRate).toBeLessThanOrEqual(lowJitterRate)
        })
    })

    describe("error handling", () => {
        it("throws when a >= b", () => {
            expect(() => FI.betweenJittered("a5", "a5", 20)).toThrow("FI.betweenJittered(a, b):")
            expect(() => FI.betweenJittered("a5", "a0", 20)).toThrow("FI.betweenJittered(a, b):")
            expect(() => FI.betweenJittered("b00", "az", 20)).toThrow("FI.betweenJittered(a, b):")
        })
    })

    describe("key length", () => {
        it("jittered keys are longer due to subdivision", () => {
            const regularKey = FI.between("a0", "a9")
            const jitteredKeys: string[] = []

            for (let i = 0; i < 50; i++) {
                jitteredKeys.push(FI.betweenJittered("a0", "a9", 20))
            }

            const avgJitteredLength = jitteredKeys.reduce((sum, k) => sum + k.length, 0) / jitteredKeys.length

            // Jittered keys should generally be longer due to the binary subdivision
            expect(avgJitteredLength).toBeGreaterThan(regularKey.length)
        })

        it("key length scales with jitter bits", () => {
            function avgKeyLength(jitterBits: number): number {
                let totalLength = 0
                const samples = 50

                for (let i = 0; i < samples; i++) {
                    totalLength += FI.betweenJittered("a0", "a9", jitterBits).length
                }

                return totalLength / samples
            }

            const len5 = avgKeyLength(5)
            const len10 = avgKeyLength(10)
            const len20 = avgKeyLength(20)

            expect(len10).toBeGreaterThan(len5)
            expect(len20).toBeGreaterThan(len10)
        })
    })

    describe("distribution", () => {
        it("results are distributed across the range", () => {
            const a = "a0"
            const b = "az"
            const results: string[] = []

            for (let i = 0; i < 1000; i++) {
                results.push(FI.betweenJittered(a, b, 20))
            }

            results.sort()

            // Check distribution by sampling quartiles
            const q1 = results[Math.floor(results.length * 0.25)]!
            const q2 = results[Math.floor(results.length * 0.5)]!
            const q3 = results[Math.floor(results.length * 0.75)]!

            // All quartiles should be between a and b
            expect(q1 > a && q1 < b).toBe(true)
            expect(q2 > a && q2 < b).toBe(true)
            expect(q3 > a && q3 < b).toBe(true)

            // Quartiles should be in order
            expect(q1 < q2).toBe(true)
            expect(q2 < q3).toBe(true)
        })
    })

    describe("stress tests", () => {
        it("handles many concurrent jittered insertions", () => {
            const keys = ["a0", "a1"]

            // Simulate 1000 concurrent insertions between a0 and a1
            const newKeys: string[] = []
            for (let i = 0; i < 1000; i++) {
                newKeys.push(FI.betweenJittered("a0", "a1", 20))
            }

            // All should be valid
            for (const key of newKeys) {
                expect(key > "a0").toBe(true)
                expect(key < "a1").toBe(true)
            }

            // When combined and sorted, should maintain order
            const allKeys = [...keys, ...newKeys].sort()
            expect(allKeys[0]).toBe("a0")
            expect(allKeys[allKeys.length - 1]).toBe("a1")
        })

        it("sequential jittered appends maintain order", () => {
            const keys: string[] = []
            let prev: string | null = null

            for (let i = 0; i < 1000; i++) {
                const key = FI.betweenJittered(prev, null, 20)
                if (prev !== null) {
                    expect(key > prev).toBe(true)
                }
                keys.push(key)
                prev = key
            }

            const sorted = [...keys].sort()
            expect(keys).toEqual(sorted)
        })
    })
})
