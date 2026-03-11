import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DepRecord } from '../utils/structuralTree.js';

export interface AnalyzedTreeRaw {
  rootPath: string;
  rootFunctionName: string;
  treeStrLLM: string;
  treeStrRead: string;
  summary: string;
}

export interface Metadata {
  repoName: string;
  analysisDir: string;
  commitId: string;
  rawParams: string[];
  businessKey: string;
  analyzedAt: string;
  version: string;
}

export class ResultReader {
  constructor(private readonly resultDir: string) {}

  /**
   * 读取 metadata.json
   */
  readMetadata(): Metadata | null {
    const file = join(this.resultDir, 'metadata.json');
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as Metadata;
    } catch {
      return null;
    }
  }

  /**
   * 列出所有 rawParam（从 4-findCall 目录扫描）
   */
  listRawParams(): string[] {
    const dir = join(this.resultDir, '4-findCall');
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  /**
   * 列出 5-treeAnalyze 下的所有 rawParam
   */
  listAnalyzedParams(): string[] {
    const dir = join(this.resultDir, '5-treeAnalyze');
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  /**
   * 读取某个 rawParam 下的所有 DependencyRecord
   */
  readDependencyRecords(rawParam: string): DepRecord[] {
    const dir = join(this.resultDir, '4-findCall', rawParam);
    if (!existsSync(dir)) return [];

    const records: DepRecord[] = [];
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          records.push(JSON.parse(line) as DepRecord);
        } catch { /* skip */ }
      }
    }

    return records;
  }

  /**
   * 读取某个 rawParam 下的所有 Stage5 分析结果
   */
  readAnalyzedTrees(rawParam: string): AnalyzedTreeRaw[] {
    const dir = join(this.resultDir, '5-treeAnalyze', rawParam);
    if (!existsSync(dir)) return [];

    const trees: AnalyzedTreeRaw[] = [];
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          trees.push(JSON.parse(line) as AnalyzedTreeRaw);
        } catch { /* skip */ }
      }
    }

    return trees;
  }
}
