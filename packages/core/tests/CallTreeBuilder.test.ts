import { describe, it, expect } from 'vitest';
import { buildFunctionCallTrees } from '../src/tree/CallTreeBuilder.js';
import type { DependencyRecord, AnalyzedCall } from '../src/types/lineage.js';

const EMPTY_CALLS: AnalyzedCall[] = [];
const EMPTY_PARAMS: any[] = [];

function mkRec(
  fn: string, ap: string, sl: number, el: number,
  calls?: AnalyzedCall[],
): DependencyRecord {
  return {
    param: 'x',
    absolutePath: ap,
    startLine: sl,
    endLine: el,
    functionName: fn,
    calls: calls ?? EMPTY_CALLS,
  };
}

function mkCall(fn: string, ap: string, sl: number, el: number): AnalyzedCall {
  return {
    functionName: fn,
    absolutePath: ap,
    startLine: sl,
    endLine: el,
    params: EMPTY_PARAMS,
  };
}

describe('buildFunctionCallTrees', () => {
  it('should return empty for empty input', () => {
    const result = buildFunctionCallTrees(EMPTY_CALLS as any);
    expect(result).toEqual(EMPTY_CALLS);
  });

  it('should build a single-node tree', () => {
    const records = Array.of(
      mkRec('handleClick', '/src/index.ts', 10, 20),
    );
    const trees = buildFunctionCallTrees(records);
    expect(trees).toHaveLength(1);
    expect(trees[0].rootFunctionName).toBe('handleClick');
    expect(trees[0].treeStrLLM).toContain('handleClick');
  });

  it('should build a parent-child tree', () => {
    const childCall = mkCall('childFn', '/src/b.ts', 5, 15);
    const parent = mkRec('parentFn', '/src/a.ts', 1, 30, Array.of(childCall));
    const child = mkRec('childFn', '/src/b.ts', 5, 15);
    const records = Array.of(parent, child);

    const trees = buildFunctionCallTrees(records);
    expect(trees).toHaveLength(1);
    expect(trees[0].rootFunctionName).toBe('parentFn');
    expect(trees[0].treeStrLLM).toContain('childFn');
  });

  it('should detect cycle (no root nodes)', () => {
    const a = mkRec('fnA', '/a.ts', 1, 10, Array.of(mkCall('fnB', '/b.ts', 1, 10)));
    const b = mkRec('fnB', '/b.ts', 1, 10, Array.of(mkCall('fnA', '/a.ts', 1, 10)));
    const records = Array.of(a, b);

    const trees = buildFunctionCallTrees(records);
    // Both are called by the other -> both in calledFunctions -> no roots
    expect(trees).toHaveLength(0);
  });

  it('should find multiple roots', () => {
    const records = Array.of(
      mkRec('rootA', '/a.ts', 1, 10),
      mkRec('rootB', '/b.ts', 1, 10),
    );
    const trees = buildFunctionCallTrees(records);
    expect(trees).toHaveLength(2);
  });

  it('should simplify treeStrRead', () => {
    const records = Array.of(
      mkRec('fn', '/very/long/path/to/file.ts', 42, 50),
    );
    const trees = buildFunctionCallTrees(records);
    expect(trees[0].treeStrRead).toContain('file.ts:42');
  });
});
