import { IDs } from "./ids";
import { assert, LastInternal, precond } from "./util";

/**
 * ALGORITHM
 *
 * The underlying total order is similar to the string implementation
 * of Plain Tree described
 * [here](https://mattweidner.com/2022/10/21/basic-list-crdt.html#intro-string-implementation).
 * The difference is a common-case optimization: left-to-right insertions
 * by the same PositionSource reuse the same (ID, counter)
 * pair (we call this a _waypoint_), just using
 * an extra _valueIndex_ to distinguish positions
 * within the sequence, instead of creating a long
 * rightward path in the tree. In this way,
 * a sequence of m left-to-right insertions see their
 * positions grow by O(log(m)) length (the size of
 * valueIndex) instead of O(m) length (the size of
 * a path containing one node per insertion).
 *
 * In more detail, the underlying tree consists of alternating
 * layers:
 * - Nodes in even layers (starting with the root's children)
 * are __waypoints__, each labeled by a pair (ID, counter). A waypoint can be either a left or right
 * child of its parent, except that the root only has right
 * children. Waypoint same-siblings siblings are sorted arbitrarily,
 * as in Plain Tree.
 * - Nodes in odd layers are __value indices__, each labelled
 * by a nonnegative integer. A value index is always a right
 * child of its parent. Value indices are sorted
 * *lexicographically*; we use a subset of numbers for which
 * this coincides with the usual order by magnitude.
 *
 * Each position corresponds to a value index node in the tree
 * whose parent waypoint's ID equals the position's
 * creator. A position is a string description of the path
 * from the root to its node (excluding the root).
 * Each pair of nodes (waypoint = (ID, counter), valueIndex)
 * is represented by the substring (here written like a template literal):
 * ```
 * ${ID},${counter},${valueIndex}${l or r}
 * ```
 * where the final value is 'l' if the next node is a left
 * child, else 'r' (including if this pair is the final node pair,
 * to ensure that a terminal node is sorted in between its
 * left and right children). For efficiency, counter and valueIndex
 * are base36-encoded.
 *
 * For the above representation to sort correctly even if fields have
 * different lengths, we use the relations:
 * - ',' < all ID characters: Thus if ID1 < ID2, also `${ID1},${etc}` < ID2,
 * including in the case when ID1 is a prefix of ID2.
 * - ',' < all base-36 numeric characters: Likewise for counters.
 * - No valueIndex is a prefix of another (lexSucc property):
 * Thus if valueIndex1 < valueIndex2, also `${valueIndex1}r` < valueIndex2
 * and `${valueIndex1}l` < valueIndex2.
 */

/**
 * A source of lexicographically-ordered "position strings" for
 * collaborative lists and text.
 *
 * In a collaborative list (or text string), you need a way to refer
 * to "positions" within that list that:
 * 1. Point to a specific list element (or text character).
 * 2. Are global (all users agree on them) and immutable (they do not
 * change over time).
 * 3. Can be sorted.
 * 4. Are unique, even if different users concurrently create positions
 * at the same place.
 *
 * PositionSource gives you such positions, in the form
 * of lexicographically-ordered strings. Specifically, `createBetween`
 * returns a new position string in between two existing position strings.
 *
 * These strings have the bonus properties:
 * - 5. (Non-Interleaving) If two PositionSources concurrently create a (forward or backward)
 * sequence of positions at the same place,
 * their sequences will not be interleaved.
 * For example, if
 * Alice types "Hello" while Bob types "World" at the same place,
 * and they each use a PositionSource to create a position for each
 * character, then
 * the resulting order will be "HelloWorld" or "WorldHello", not
 * "HWeolrllod".
 * - 6. If a PositionSource creates positions in a forward (increasing)
 * sequence, their lengths as strings will only grow logarithmically,
 * not linearly.
 *
 * Position strings are printable ASCII. Specifically, they
 * contain alphanumeric characters, `','`, and `'.'`.
 * Also, the special string `PositionSource.LAST` is `'~'`.
 *
 * Further reading:
 * - [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
 * a related scheme that satisfies 1-3 but not 4-6.
 * - [List CRDTs](https://mattweidner.com/2022/10/21/basic-list-crdt.html)
 * and how they map to position strings. PositionSource uses an optimized
 * variant of that link's string implementation.
 * - [Paper](https://www.repository.cam.ac.uk/handle/1810/290391) about
 * interleaving in collaborative text editors.
 */
export class PositionSource {
  /**
   * A string that is less than all positions.
   *
   * Value: `""`.
   */
  static readonly FIRST: string = "";
  /**
   * A string that is greater than all positions.
   *
   * Value: `"~"`.
   */
  static readonly LAST: string = LastInternal;

  /**
   * The unique ID for this PositionSource.
   */
  readonly ID: string;
  /**
   * `{ID}.`, i.e., our waypoint's long name minus the leading ','
   * (which is omitted in the beginning).
   */
  private readonly idPlusDot: string;

  /**
   * For each waypoint that we created, maps a prefix for that
   * waypoint (omitting valueIndex and 'r') to the last (most recent)
   * valueIndex.
   *
   * This map has size equal to our number of waypoints.
   */
  private lastValueIndices = new Map<string, number>();

  /**
   * Constructs a new PositionSource.
   *
   * It is okay to share a single PositionSource between
   * all documents (lists/text strings) in the same JavaScript runtime.
   *
   * For efficiency, within each JavaScript runtime, you should not use
   * more than one PositionSource for the same document (list/text string).
   * An exception is if multiple logical users share the same runtime;
   * we then recommend one PositionSource per user.
   *
   * @param options.ID A unique ID for this PositionSource. Defaults to
   * `IDs.random()`.
   *
   * If provided, `options.ID` must satisfy:
   * - It is unique across the entire collaborative application, i.e.,
   * all PositionSources whose positions may be compared to ours. This
   * includes past PositionSources, even if they correspond to the same
   * user/device.
   * - It does not contain `'.'` or `','`.
   * - The first character is lexicographically less than `'~'` (code point 126).
   *
   * If `options.ID` contains non-alphanumeric characters, created positions
   * will contain those characters in addition to the usual.
   */
  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();
    this.idPlusDot = `${this.ID}.`;
  }

  /**
   * Returns a new position between `left` and `right`
   * (`left < new < right`).
   *
   * The new position is unique across the entire collaborative application,
   * even in the face on concurrent calls to this method on other
   * PositionSources.
   *
   * @param left Defaults to `PositionSource.FIRST` (insert at the beginning).
   * @param right Defaults to `PositionSource.LAST` (insert at the end).
   */
  createBetween(
    left: string = PositionSource.FIRST,
    right: string = PositionSource.LAST
  ): string {
    precond(left < right, "left must be less than right:", left, "!<", right);
    precond(
      right <= PositionSource.LAST,
      "right must be less than or equal to LAST",
      right,
      PositionSource.LAST
    );

    const leftFixed = left === PositionSource.FIRST ? null : left;
    const rightFixed = right === PositionSource.LAST ? null : right;

    let ans: string;

    if (
      rightFixed !== null &&
      (leftFixed === null || rightFixed.startsWith(leftFixed))
    ) {
      // Left child of right. This always uses a new waypoint.
      const ancestor = leftVersion(rightFixed);
      ans = this.withNewWaypoint(ancestor);
    } else {
      // Right child of left.
      if (leftFixed === null) {
        // ancestor is FIRST.
        ans = this.withNewWaypoint(PositionSource.FIRST);
      } else {
        // Check if we can reuse left's prefix.
        // It needs to be one of ours, and right can't use the same
        // prefix (necessarily with a greater valueIndex).
        const prefix = getPrefix(leftFixed);
        const lastValueIndex = this.lastValueIndices.get(prefix);
        if (
          lastValueIndex !== undefined &&
          !(rightFixed !== null && rightFixed.startsWith(prefix))
        ) {
          // Reuse.
          const valueIndex = lexSucc(lastValueIndex);
          ans = prefix + stringifyValueIndex(valueIndex);
          this.lastValueIndices.set(prefix, valueIndex);
        } else {
          // New waypoint.
          ans = this.withNewWaypoint(leftFixed);
        }
      }
    }

    assert(left < ans && ans < right, "Bad position:", left, ans, right);
    return ans;
  }

  /**
   * Creates (& stores) a new waypoint with the given ancestor (= prefix
   * adjusted for side), returning the position.
   */
  private withNewWaypoint(ancestor: string): string {
    const waypoint = this.newWaypointName(ancestor);
    this.lastValueIndices.set(ancestor + waypoint, 1);
    return ancestor + waypoint + stringifyValueIndex(1);
  }

  /**
   * Returns the name to use for a new waypoint following ancestor.
   */
  private newWaypointName(ancestor: string): string {
    // See if our ID appears already in ancestor.
    const existing = ancestor.lastIndexOf(this.idPlusDot);
    const valid =
      existing !== -1 &&
      (existing === 0 || ancestor.charAt(existing - 1) === ",");
    if (valid) {
      // Find the index of existing among the long-form (idName)
      // waypoints, counting backwards. Here we use the fact
      // that each idName ends with '.', and '.' does not appear otherwise.
      let index = -1;
      for (let i = existing; i < ancestor.length; i++) {
        if (ancestor.charAt(i) === ".") index++;
      }
      // Waypoint name is index interpreted as a "counter".
      return stringifyCounter(index);
    } else {
      // No existing occurrence; use `,${ID}.`, unless
      // its the beginning, in which case lose the '.'.
      if (ancestor === "") return this.idPlusDot;
      else return "," + this.idPlusDot;
    }
  }
}

/**
 * Base 36 encoding. This works with lexSucc since the base36
 * chars are lexicographically ordered by value.
 */
function stringifyValueIndex(n: number): string {
  return n.toString(36);
}

function parseValueIndex(s: string): number {
  return Number.parseInt(s, 36);
}

/**
 * Base 36, except for last digit, which is base 26 using
 * capital letters. This makes it easy to find the end when it
 * is followed by a base36 (= digits & lowercase letters) valueIndex.
 */
function stringifyCounter(n: number): string {
  if (n < 26) return String.fromCharCode(65 + n);
  else {
    return Math.floor(n / 26).toString(36) + String.fromCharCode(65 + (n % 26));
  }
}

/**
 * Returns position's prefix (TODO: define: part through last waypoint name).
 */
function getPrefix(position: string): string {
  // Last waypoint char is the last '.' or capital letter.
  // We know it's not the very last char (always a valueIndex).
  for (let i = position.length - 2; i >= 0; i--) {
    const char = position.charAt(i);
    if (char === "." || (char >= "A" && char <= "Z")) {
      // i is the last waypoint char, i.e., the end of the prefix.
      return position.slice(0, i + 1);
    }
  }
  assert(false, "No last waypoint char found (not a position?)", position);
  return "";
}

/**
 * Returns the variant of position ending with a "left" marker
 * instead of the default "right" marker.
 *
 * The return value is not a position, but may be used as an ancestor
 * of a position.
 */
function leftVersion(position: string) {
  const last = parseValueIndex(position.charAt(position.length - 1));
  // last should be an odd base36 number. Subtract 1, making it even.
  assert(last % 2 === 1, "Bad side marker (not a position?)", last, position);
  return position.slice(0, -1) + stringifyValueIndex(last - 1);
}

const log36 = Math.log(36);

/**
 * Returns the successor of n in an enumeration of a special
 * set of numbers.
 *
 * That enumeration has the following properties:
 * 1. Each number is a nonnegative integer (however, not all
 * nonnegative integers are enumerated).
 * 2. The number's base-36 representations are enumerated in
 * lexicographic order, with no prefixes (i.e., no string
 * representation is a prefix of another).
 * 3. The n-th enumerated number has O(log(n)) base-36 digits.
 *
 * Properties (2) and (3) are analogous to normal counting,
 * with the usual order by magnitude; the novelty here is that
 * we instead use the lexicographic order on base-36 representations.
 * It is also the case that
 * the numbers are in order by magnitude, although we do not
 * use this property.
 *
 * The specific enumeration is:
 * - Start with 0.
 * - Enumerate 18^1 numbers (0, 1, ..., h = 17).
 * - Add 1, multiply by 36, then enumerate 18^2 numbers
 * (i0, i1, ..., qz).
 * - Add 1, multiply by 36, then enumerate 18^3 numbers
 * (r0, r1, ..., vhz).
 * - Repeat this pattern indefinitely, enumerating
 * 18^d d-digit numbers for each d >= 1. Putting a decimal place
 * in front of each number, each d consumes 2^(-d) of the remaining
 * values, so we never "reach 1" (overflow to d+1 digits when
 * we meant to use d digits).
 *
 * TODO: odds only now
 */
function lexSucc(n: number): number {
  // OPT: learn d from the stringified number.
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / log36) + 1;
  if (n === Math.pow(36, d) - Math.pow(18, d) - 1) {
    // First step is a new length: n -> (n + 1) * 36 + 1
    return (n + 1) * 36 + 1;
  } else {
    // n -> n + 2
    return n + 2;
  }
}
