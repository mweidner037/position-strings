# Algorithm

## Background

At a high level, position-strings implements the core of a List CRDT. Each position string corresponds to an element in the list, such that the lexicographic order on strings matches the list order. We don't implement a literal List CRDT with state and operations, but it's straightforward to implement one on top of position-strings.

More specifically, position-strings is based on [Plain Tree: A Basic List CRDT](https://mattweidner.com/2022/10/21/basic-list-crdt.html#a-basic-uniquely-dense-total-order). It is an optimized version of that post's [string implementation](https://mattweidner.com/2022/10/21/basic-list-crdt.html#intro-string-implementation), which uses strings to represent paths in a tree. The strings are designed so that their lexicographic order matches the tree's [in-order traversal](https://en.wikipedia.org/wiki/Tree_traversal#In-order,_LNR) order.

## Tree Structure

position-strings's implicit tree is structured in layers. Each layer has a specific type and can only contain nodes of that type. There are 3 layer types that alternate cyclically (1 -> 2 -> 3 -> 1 -> 2 -> 3 -> ...). Each position string corresponds to a type-3 node, and the string itself encodes the node labels on the path from the root to that node.

The 3 node/layer types are:

1. **Waypoint nodes**: Labeled by the ID of the `PositionSource` that created it, sorted arbitrarily. The ID ensures that positions created by different `PositionSource`s are distinct: each `PositionSource` only returns positions whose _final_ waypoint node uses its own ID.
2. **valueIndex nodes**: Labeled by an integer, sorted by magnitude. When a `PositionSource` creates positions in a left-to-right sequence, instead of appending a new waypoint node each time, it reuses the first waypoint node and just increases the valueIndex. That causes the position string length to grow logarithmically instead of linearly.
3. **Side nodes**: Labeled by a bit "left side" (0) or "right side" (1). The actual position at a node, and all of the node's right-side descendants, use "right side"; all of its left-side descendants use "left side". We then acheive the in-order traveral order (left descendants) < (node itself) < (right descendants), by setting "left side" < "right side" and by sorting each path before its suffixes (like lexicographic order).

### `createBetween`

In terms of the tree structure, `Position.createBetween(left, right)` does the following:

1. If `right` is a descendant of `left`, create a left descendant of `right` as follows. First, create a new waypoint node that is a left child of `right` (replacing `right`'s final "right side" bit with "left side"). Then append a valueIndex 0 node and a "right side" node, to fill out the 3 layers. Return that final node.
2. Otherwise, see if we can just increase `left`'s final valueIndex, instead of lengthing its path. This is allowed if (a) `left`'s final waypoint node uses our ID, and (b) `right` doesn't use that same waypoint node. If so, look up the next unused valueIndex for that waypoint (stored in `PositionSource`), then use `left` but with that final valueIndex.
3. If not, create a right descendant of `left` like in case 1: append a new waypoint node, then valueIndex 0, then "right side"; return that final node.

You can check that the resulting node lies between `left` and `right`, and that this procedure satisfies properties 4-6 from the [README](./README.md).

> The tree we've described so far is similar to that used by the [Logoot List CRDT](https://doi.org/10.1109/ICDCS.2009.75), which also has alternating layers of IDs and numbers. However, Logoot sorts by numbers first and then IDs, while we do the opposite. This lets us avoid interleaving: if two `PositionSource`s concurrently create a sequence of positions at the same place, their positions will end up under different waypoint nodes, hence appear one after the other.

## String Representation

Finally, we need to map type-3 nodes in the above tree to position strings, such that the tree order matches the position strings' lexicographic order.

Given a tree node `a`, let `aPath` be the sequence of node labels on the path from the root to that node. Note that the tree order matches the "lexicographic order" on these sequences: `a < b` if `aPath[i] < bPath[i]` at the first index `i` where they disagree, or if `aPath` is a strict prefix of `bPath`.

I claim that we can set `a`'s position string to be `aPos = aPath.map(f).join("")` for any `f: (label: string, i: number) => string` with the following property:

- If `aPath` and `bPath` first disagree at index `i` and `aPath[i] < bPath[i]`, then:
  1. `f(aPath[i], i) < f(bPath[i], i)` as strings.
  2. `f(aPath[i], i)` is not a prefix of `f(bPath[i], i)`.

Indeed, then there is some index `j` such that `f(aPath[i], i).charAt(j) < f(bPath[i], i).charAt(j)`. Hence no matter what happens in the rest of `aPos` and `bPos`, we'll still have `aPos < bPos`.

One working `f` is defined as follows, with a different rule for each layer type:

1. (Waypoint nodes) Map the node's label (an ID) to `` `${ID},` ``. The comma, which is not allowed in IDs, ensures the no-prefix rule (b).
2. (valueIndex nodes) Map the valueIndex into a special enumeration of numbers that is in lexicographic order and has no prefixes (when base52 encoded), then base52 encode that number. You can read about the enumeration we use in the comment above [`position_source.ts`](./src/position_source.ts)'s `nextValueIndex` function.
3. (Side nodes) Map "left side" to `"0"` and "right side" to `"1"`.

### Optimizations

In the actual implementation, we optimize the above string representation in two ways.

First, for waypoint nodes, we only use each "long name" `` `${ID},` `` once per position string. If the same ID occurs later in the same path, those nodes get a "short name" that is just an index into the list of prior long names. Index `n` is encoded as `base52(n // 10) + base10(n % 10)`. The set of all waypoint names following a given path is still unique, which ensures rule (a) for some arbitrary order (thought not necessarily the order on IDs); and they are prefix-free (rule (b)) due to short names' special ending digit and long names' special end comma (TODO: and starting char)?

TODO: could a short name end up being a prefix of a long name? E.g. "0" vs "0afdskl,". Could fix with prefix "."; if so update benchmarks and ID instructions.

Second, instead of giving each side node a whole character, we give it the last bit in the preceding valueIndex. Specifically, before mapping valueIndex into its special enumeration, we double it, then add 1 if the side is "right side".

TODO: In the actual code, we use valueIndex to refer to the combined valueIndex + enumeration + side bit, instead of the original valueIndex. (Change?)