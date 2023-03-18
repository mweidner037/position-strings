import { assert } from "chai";
import fs from "fs";
import createRBTree from "functional-red-black-tree";
import seedrandom from "seedrandom";
import { IDs, PositionSource } from "../src";
import realTextTraceEdits from "./real_text_trace_edits.json";

const resultsDir = "benchmark_results/";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

function run(ops?: number, rotateFreq?: number) {
  console.log(
    "## Run:",
    ops ?? "all",
    "ops; rotate",
    rotateFreq ? `every ${rotateFreq} ops` : "never"
  );
  console.log();

  const rng = seedrandom("42");
  let source = new PositionSource({
    ID: IDs.pseudoRandom(rng),
  });
  let list = createRBTree<string, string>();
  // In order of creation, so we can watch time trends.
  const metrics: PositionMetric[] = [];

  for (let i = 0; i < (ops ?? edits.length); i++) {
    if (rotateFreq && i > 0 && i % rotateFreq === 0) {
      source = new PositionSource({ ID: IDs.pseudoRandom(rng) });
    }
    const edit = edits[i];
    if (edit[2] !== undefined) {
      // Insert edit[2] at edit[0]
      const position = source.createBetween(
        edit[0] === 0 ? undefined : list.at(edit[0] - 1).key,
        edit[0] === list.length ? undefined : list.at(edit[0]).key
      );
      list = list.insert(position, edit[2]);
      metrics.push(getMetric(position));
    } else {
      // Delete character at edit[0].
      list = list.at(edit[0]).remove();
    }
  }

  if (ops === undefined) {
    // Check answer.
    assert.strictEqual(finalText, list.values.join(""));
  }

  // Print summary stats.
  // Note: collecting & summarizing data contributes a noticable
  // fraction of the runtime.
  printStats(
    "length",
    metrics.map((metric) => metric.length)
  );
  printStats(
    "longNodes",
    metrics.map((metric) => metric.longNodes)
  );
  printStats(
    "nodes",
    metrics.map((metric) => metric.nodes)
  );
  printStats(
    "valueIndexCount",
    metrics.map((metric) => metric.valueIndexCount)
  );

  // Estimate PositionSource memory usage.
  // @ts-expect-error Private access
  const lastValueIndices = source.lastValueIndices;
  const keyLengths = [...lastValueIndices.keys()]
    .map((prefix) => prefix.length)
    .reduce((a, b) => a + b, 0);
  console.log("### PositionSource memory usage\n");
  console.log("- Map size:", lastValueIndices.size);
  console.log("- Sum of map key lengths:", keyLengths);
  console.log();

  // Write data files.
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const fileName = `results_${ops ?? "all"}_${rotateFreq ?? "never"}.csv`;
  const csv =
    "Length,LongNodes,Nodes,ValueIndexCount\n" +
    metrics
      .map(
        (metric) =>
          `${metric.length},${metric.longNodes},${metric.nodes},${metric.valueIndexCount}`
      )
      .join("\n");
  fs.writeFileSync(resultsDir + fileName, csv);
}

/**
 * Data for a single position string.
 */
interface PositionMetric {
  /** The position's length. */
  length: number;
  /**
   * The number of tree nodes using long waypoint names.
   * Equivalently, the number of full IDs in the string.
   */
  longNodes: number;
  /** The total number of tree nodes. */
  nodes: number;
  /**
   * The "count" for the position's (final) valueIndex, i.e., its
   * index in the enumeration of valueIndex's.
   */
  valueIndexCount: number;
}

function getLastWaypointChar(position: string): number {
  // Last waypoint char is the last '.' or digit.
  // We know it's not the very last char (always a valueIndex).
  for (let i = position.length - 2; i >= 0; i--) {
    const char = position.charAt(i);
    if (char === "." || ("0" <= char && char <= "9")) {
      // i is the last waypoint char, i.e., the end of the prefix.
      return i;
    }
  }
  throw new Error("lastWaypointChar not found: " + position);
}

function parseBase52(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const digit = code - (code >= 97 ? 71 : 65);
    n = 52 * n + digit;
  }
  return n;
}

function getMetric(position: string): PositionMetric {
  // Nodes = # periods, since we end each ID with one.
  let periods = 0;
  for (const char of position) {
    if (char === ".") periods++;
  }
  const longNodes = periods;

  // Get valueIndex: after last waypoint char.
  const lastWaypointChar = getLastWaypointChar(position);
  const valueIndex = parseBase52(position.slice(lastWaypointChar + 1));

  return {
    length: position.length,
    longNodes,
    nodes: nodeCount(position),
    valueIndexCount: lexSuccCount(valueIndex),
  };
}

function nodeCount(position: string): number {
  // One node per:
  // - '.' (end of a long name)
  // - Digit outside of a long name
  // (end of a short name).
  let count = 0;
  for (let i = position.length - 1; i >= 0; i--) {
    const char = position.charAt(i);
    if (char === ".") {
      // End of a long name.
      count++;
      // Skip the rest of the long name in case in contains
      // a non-short-name digit.
      i -= IDs.DEFAULT_LENGTH;
    } else if ("0" <= char && char <= "9") count++;
  }
  return count;
}

/**
 * Returns n's index in the lexSucc output sequence.
 */
function lexSuccCount(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / Math.log(52)) + 1;
  // First d-digit number is 52^d - 52 * 26^(d-1); check how far
  // we are from there (= index in d-digit sequence)
  let ans = n - (Math.pow(52, d) - 52 * Math.pow(26, d - 1));
  // Previous digits d2 get 26^d2 digits each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(26, d2);
  }
  // Sequence uses odds only, so discount that.
  return (ans - 1) / 2;
}

function printStats(name: string, data: number[]) {
  console.log(`### ${name}\n`);
  console.log(
    "- Average:",
    Math.round(data.reduce((a, b) => a + b, 0) / data.length)
  );
  data.sort((a, b) => a - b);
  console.log("- Median:", percentile(data, 0.5));
  console.log("- 99th percentile:", percentile(data, 0.99));
  console.log("- Max:", percentile(data, 1));
  console.log();
}

function percentile(sortedData: number[], alpha: number) {
  const index = Math.ceil(alpha * sortedData.length) - 1;
  return sortedData[index];
}

// In the order described in README.md#performance.
run();
run(undefined, 1000);
run(10000);
run(10000, 1000);
