<div align="center">

<h1>fractional-indexing</h1>

![Minified](https://img.shields.io/badge/Minified-2.62_KB-blue?style=flat-square&labelColor=%2315161D&color=%2369a1ff) ![Minzipped](https://img.shields.io/badge/Minzipped-989_B-blue?style=flat-square&labelColor=%2315161D&color=%2369a1ff)

**Lexicographically sortable keys for ordering lists without renumbering.**

[Documentation](https://MichaelOstermann.github.io/fractional-indexing)

</div>

## The problem

Sometimes you need to store ordered lists while avoiding renumbering them when a new item gets inserted, for example when storing sortable lists in SQL/graph databases.

This could for example be accomplished by introducing a numeric property:

```ts
const list = [
    { ..., index: 0 },
    { ..., index: 1 },
    { ..., index: 2 },
];
```

Prepending can be accomplished via `first.index - 1`, appending via `last.index + 1` and inserting in between via `(a.index + b.index) / 2`.

However while this may seem to work fine initially, this creates several problems after a while:

### Float precision

As JavaScript numbers are stored as double precision floating point numbers following the international IEEE 754 standard, continuously inserting new entries in between will eventually result with collisions:

```ts
let a = 0;
let b = 1;

let i = 0;
while (true) {
    const c = (a + b) / 2;
    if (c === a || c === b) throw new Error(`Collision after ${i} steps`);
    if (Math.random() < 0.5) a = c;
    else b = c;
    i++;
}
```

```
error: Collision after 54 steps
```

Incrementing indices by a factor larger than `1` at best very slightly delays this issue, using `BigInt` based implementations results with indices growing rapidly in size, to the point of JS engines running out of memory.

In such an event the only real solution is to unfortunately rebalance the entire list.

### Sequence poisoning

In production systems, observing occasional collisions may not be deemed as a deal breaker, however the real damage starts happening afterwards:

```ts
const list = [
    { ..., index: 0.34765625 },
    { ..., index: 0.34765625 },
];
```

Any amount of items that get inserted between `a` and `b` are now guaranteed to adopt the already colliding index, which to my experience heavily harms UX, especially when unstable sorting algorithms are at play.

### Concurrency

In concurrent scenarios, such as collaborative applications, multiple users often perform similar operations simultaneously. When two users append to the same list at roughly the same time, they both compute the same index:

```ts
// User A and User B both see the list ending with index 5
// Both compute: newIndex = 5 + 1 = 6

// User A inserts: { title: "User A's item", index: 6 }
// User B inserts: { title: "User B's item", index: 6 }
```

The bigger lists are, the less likely it is for two people to insert in between the same position, however prepends and appends are fairly common operations where conflicts are most likely to occur.

Once a collision occurs, the list enters sequence poisoning territory, degrading the experience for all future operations.

This can be somewhat mitigated by forcing an API instead, such as:

```ts
// Append after item
fetch("/api/items", {
    method: "POST",
    body: JSON.stringify({
        after: "item-id",
        title: "New item",
    }),
});

// Prepend before item
fetch("/api/items", {
    method: "POST",
    body: JSON.stringify({
        before: "item-id",
        title: "New item",
    }),
});

// Insert between two items
fetch("/api/items", {
    method: "POST",
    body: JSON.stringify({
        after: "item-a",
        before: "item-b",
        title: "New item",
    }),
});
```

Where servers are responsible determining indices, however that usually only moves complexity around, as this still entails a myriad of race conditions, requiring servers to handle conflict resolution.

## The solution

This library follows [David Greenspan's fractional indexing algorithm](https://observablehq.com/@dgreensp/implementing-fractional-indexing) using lexicographically sortable base-62 strings.

### Key structure

Each key has two parts: an **integer** part and an optional **fractional** part.

```
key = [integer][fractional]
```

The integer part consists of a **head** character (1 char) that determines how many **body** characters follow:

```
integer = [head][body]
```

Examples:

- `"a5"` → head=`a`, body=`5` → integer=`a5`, fractional=``
- `"b12"` → head=`b`, body=`12` → integer=`b12`, fractional=``
- `"a0V"` → head=`a`, body=`0` → integer=`a0`, fractional=`V`

### Why this design?

This encoding gives **O(log n)** key growth for sequential operations:

- Appending n items: keys grow as log₆₂(n)
- Prepending n items: same, using negative integers
- Inserting between: uses fractional part to subdivide

The fractional part allows infinite subdivision between any two adjacent integers.

### How appending works

When you append (`FI.between(key, null)`), the algorithm increments the integer part:

```
a0 → a1 → a2 → ... → a9 → aA → aB → ... → aZ → aa → ab → ... → az
```

When the body overflows (reaches `z`), the head advances and the body gets longer:

```
az → b00 → b01 → ... → b0z → b10 → ... → bzz → c000 → ...
```

This is why key length grows logarithmically: you need 62 appends to go from `a0` to `az`, then 62² more to exhaust all `b**` keys, then 62³ for `c***`, etc.

**Prepending** works the same way in reverse, using the negative integer space (`Z`, `Y`, `X`, ...):

```
a0 ← Zz ← Zy ← ... ← Z0 ← Yzz ← ... ← Y00 ← Xzzz ← ...
```

### How inserting between works

When inserting between two keys, the algorithm first tries to find an integer midpoint:

```ts
FI.between("a0", "a9"); // → "a4" (integer midpoint)
FI.between("a0", "a2"); // → "a1" (integer midpoint)
```

When the integers are adjacent (no integer between them), it uses the **fractional part** instead. The fractional part subdivides the space using base-62 midpoints:

```ts
FI.between("a0", "a1"); // → "a0V" (no integer between, so add fractional "V")
```

Here `V` is the midpoint character between `0` and `z` in base-62. The key `a0V` sorts after `a0` but before `a1`:

```
"a0" < "a0V" < "a1"   ✓ (lexicographic ordering)
```

Subsequent inserts continue subdividing the fractional part:

```ts
FI.between("a0", "a0V"); // → "a0G" (midpoint of "" and "V")
FI.between("a0G", "a0V"); // → "a0N" (midpoint of "G" and "V")
FI.between("a0N", "a0V"); // → "a0S"
FI.between("a0S", "a0V"); // → "a0T"
FI.between("a0T", "a0V"); // → "a0U"
FI.between("a0U", "a0V"); // → "a0UV" (adjacent chars, extend with "V")
```

When fractional characters become adjacent (like `U` and `V`), the algorithm extends the key by another character. This is why repeated inserts at the same position cause linear key growth—each ~5-6 inserts add one character.

### Summary

In a nutshell, this supports ~10⁴⁶ appends/prepends, no limit for inserting in between, with generally low index size growth.

| List size | Avg. index length | Sample     |
| --------- | ----------------- | ---------- |
| 100       | 3.4               | `a0t`      |
| 1.000     | 3.8               | `a2UH`     |
| 10.000    | 4.5               | `a0g8S`    |
| 100.000   | 5.5               | `a1enBg`   |
| 1.000.000 | 6.4               | `a1vieVgk` |

## Example

```ts
import { FI } from "@monstermann/fractional-indexing";

// Start with an empty list - get first key
const first = FI.between(null, null); // "a0"

// Append after first
const second = FI.between(first, null); // "a1"
const third = FI.between(second, null); // "a2"

// Prepend before first
const before = FI.between(null, first); // "Zz"

// Insert between two keys
const middle = FI.between(first, second); // "a0V"

// Keys sort correctly with standard string comparison
const keys = [third, first, middle, before, second];
keys.sort(); // ["Zz", "a0", "a0V", "a1", "a2"]
```

## Installation

```sh [npm]
npm install @monstermann/fractional-indexing
```

```sh [pnpm]
pnpm add @monstermann/fractional-indexing
```

```sh [yarn]
yarn add @monstermann/fractional-indexing
```

```sh [bun]
bun add @monstermann/fractional-indexing
```

## FI.between

```ts
function FI.between(
    a: string | null,
    b: string | null,
): string
```

Generates a key that sorts between `a` and `b`. Pass `null` to indicate the start or end of the list.

- `FI.between(null, null)` → first key in an empty list
- `FI.between(key, null)` → append after `key`
- `FI.between(null, key)` → prepend before `key`
- `FI.between(a, b)` → insert between `a` and `b`

Throws if `a >= b`.

```ts
FI.between(null, null); // "a0"
FI.between("a0", null); // "a1"
FI.between(null, "a0"); // "Zz"
FI.between("a0", "a1"); // "a0V"
FI.between("a0", "a0V"); // "a0G"
```

## FI.betweenJittered

```ts
function FI.betweenJittered(
    a: string | null,
    b: string | null,
    jitterBits: number,
): string
```

Like `FI.between`, but picks a random position within the range instead of the midpoint. This reduces collisions when multiple users insert at the same position concurrently.

The `jitterBits` parameter controls the size of the random space (2^jitterBits possible positions). Higher values = fewer collisions but longer keys.

```ts
// Two users inserting between the same keys will likely get different results
FI.betweenJittered("a0", "a1", 20); // "a0Hq3f..." (random)
FI.betweenJittered("a0", "a1", 20); // "a0TmWx..." (different random)

// Useful for collaborative apps
FI.betweenJittered(null, null); // random first key
FI.betweenJittered("a0", null, 10); // less jitter, shorter keys
FI.betweenJittered("a0", null, 30); // more jitter, fewer collisions
```

### Collision probability

When using `betweenJittered`, the probability of two concurrent operations producing the same key follows the [birthday problem](https://en.wikipedia.org/wiki/Birthday_problem). With `n` concurrent operations and `jitterBits` bits of randomness:

```ts
function collisionProbability(
    concurrentOps: number,
    jitterBits: number,
): string {
    const n = 2 ** jitterBits;
    const probability =
        1 - Math.exp(-(concurrentOps * concurrentOps) / (2 * n));
    const percentage = probability * 100;
    return percentage < 0.01
        ? `${percentage.toExponential(2)}%`
        : `${percentage.toPrecision(2)}%`;
}
```

Use this function to determine an appropriate `jitterBits` value for your scenario.

## FI.validate

```ts
function FI.validate(key: string): boolean
```

Returns `true` if the key has valid structure (valid head character and sufficient length for the integer part).

```ts
FI.validate("a0"); // true
FI.validate("b12"); // true
FI.validate("a0V"); // true
FI.validate(""); // false (empty)
FI.validate("5"); // false (invalid head)
FI.validate("b1"); // false (head 'b' requires 2 body chars)
```

