import type { ParamVariantPair, ParamFunctionLocation, CallTree, DependencyRecord } from '../types/index.js';

/** Stage 1 output — project overview already written to disk by Agent */
export interface ProjectAnalyzeResult {
  overviewPath: string;
}

/** Stage 2 output — all confirmed param↔variant pairs with grep-validated variants */
export interface ParamVariantResult {
  pairs: ParamVariantPair[];
}

/** Single param variant discovery result (internal) */
export interface SingleParamVariantResult {
  rawParam: string;
  aiSearch: string[];
  regexSearch: string[];
  matches: string[];
  durationSec: number;
}

/** Stage 3 output — located param occurrences in functions, enriched with git info */
export interface ParamLocateResult {
  /** grouped by rawParam */
  locationsByParam: Map<string, ParamFunctionLocation[]>;
  /** flat list for convenience */
  allLocations: ParamFunctionLocation[];
}

/** Stage 4 output — dependency graph records per rawParam */
export interface DependencyGraphResult {
  recordsByParam: Map<string, DependencyRecord[]>;
}

/** Stage 5 output — analyzed call trees per rawParam */
export interface TreeAnalyzeResult {
  treesByParam: Map<string, Array<CallTree & { summary: string }>>;
}

/** Combined pipeline context passed between stages */
export interface PipelineContext {
  stage1?: ProjectAnalyzeResult;
  stage2?: ParamVariantResult;
  stage3?: ParamLocateResult;
  stage4?: DependencyGraphResult;
  stage5?: TreeAnalyzeResult;
}
