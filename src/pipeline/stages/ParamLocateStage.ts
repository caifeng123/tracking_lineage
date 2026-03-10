import path from 'path';
import { readFileSync } from 'fs';
import type { IResultStore } from '../../storage/index.js';
import { GrepEngine } from '../../search/index.js';
import { findMethodsByLines } from '../../ast/index.js';
import { GitService } from '../../git/index.js';
import type { ParamVariantPair, ParamFunctionLocation } from '../../types/index.js';
import type { ParamLocateResult } from '../types.js';

export class ParamLocateStage {
  private readonly grep: GrepEngine;
  private readonly git: GitService;
  private readonly rootDir: string;

  constructor(
    private readonly store: IResultStore,
    private readonly businessKey: string,
    rootDir?: string,
  ) {
    this.rootDir = rootDir ?? process.cwd();
    this.grep = new GrepEngine(this.rootDir);
    this.git = new GitService(this.rootDir);
  }

  run(pairs: ParamVariantPair[]): ParamLocateResult {
    console.log('[Stage3] 全局搜索变种对应函数...');
    const startTime = Date.now();

    const repoName = this.git.getRepoName();
    const commitId = this.git.getCurrentCommitId();

    const locationsByParam = new Map<string, ParamFunctionLocation[]>();
    const allLocations: ParamFunctionLocation[] = [];

    for (const pair of pairs) {
      const locations = this.locateParam(pair, repoName, commitId);
      if (locations.length === 0) continue;

      const existing = locationsByParam.get(pair.rawParam) ?? [];
      existing.push(...locations);
      locationsByParam.set(pair.rawParam, existing);
      allLocations.push(...locations);
    }

    console.log(`[Stage3] 搜索完成, 共 ${allLocations.length} 个位置, 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return { locationsByParam, allLocations };
  }

  private locateParam(
    pair: ParamVariantPair,
    repoName: string,
    commitId: string,
  ): ParamFunctionLocation[] {
    const { rawParam, param } = pair;
    console.log(`  [Stage3] 搜索字段 ${param}...`);
    const searchStart = Date.now();

    // 3.1 搜索所有位置
    const grepResults = this.grep.searchRepo(param);
    const fileLines = grepResults.map(({ file, matches }) => ({
      file,
      lines: [...new Set(matches.map((m) => m.line))],
    }));

    // 3.2 AST 解析找到所在函数
    const allMethods = fileLines.flatMap(({ file, lines }) =>
      findMethodsByLines(file, lines),
    );

    // 3.3 按函数维度去重，过滤类型/注释/import
    const deduped = new Map<string, ParamFunctionLocation>();
    for (const method of allMethods) {
      const { paramLocationType } = method;
      if (
        paramLocationType === 'type' ||
        paramLocationType.startsWith('comment') ||
        paramLocationType === 'import' ||
        paramLocationType === 'require'
      ) {
        continue;
      }

      const key = `${method.filePath}:${method.startLine}`;
      if (deduped.has(key)) continue;

      const relativeFilePath = path.relative(this.rootDir, method.filePath);
      const relativeParamLocation = path.relative(this.rootDir, method.paramLocation);

      // Git 信息
      const lineInfo = this.git.getLineCommitInfo(relativeFilePath, method.startLine);
      const fileInfo = this.git.getFileLastCommitInfo(relativeFilePath);

      const location: ParamFunctionLocation = {
        ...method,
        rawParam,
        param,
        relativeFilePath,
        relativeParamLocation,
        lineAuthor: lineInfo?.lineAuthor,
        lineDate: lineInfo?.lineDate,
        fileAuthor: fileInfo?.fileAuthor,
        fileDate: fileInfo?.fileDate,
        repoName,
        commitId,
        businessKey: this.businessKey,
      };

      deduped.set(key, location);
    }

    const locations = [...deduped.values()];

    // 3.4 保存结果
    this.store.ensureDir(`3-searchParamsFunc/${rawParam}`);
    this.store.save(
      `3-searchParamsFunc/${rawParam}/${param}.json`,
      JSON.stringify(locations, null, 2),
    );

    console.log(`  [Stage3] ${param}: ${locations.length} 个函数 (${((Date.now() - searchStart) / 1000).toFixed(1)}s)`);
    return locations;
  }
}
