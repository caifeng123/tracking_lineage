export interface ParamVariantPair { rawParam: string; param: string; }

export type ParamLocationType =
  | 'function' | 'global' | 'type' | 'import' | 'require'
  | 'comment-single' | 'comment-multi';

export interface FunctionLocation {
  functionName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  paramLocationType: ParamLocationType;
  paramLocation: string;
}

export interface ParamFunctionLocation extends FunctionLocation {
  rawParam: string;
  param: string;
  relativeFilePath: string;
  relativeParamLocation: string;
  lineAuthor?: string;
  lineDate?: string;
  fileAuthor?: string;
  fileDate?: string;
  repoName: string;
  commitId: string;
  businessKey: string;
}

export interface AnalyzedParam {
  name: string;
  index: number;
  reason: string;
}

export interface AnalyzedCall {
  functionName: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  params: AnalyzedParam[];
}

export interface LLMFunctionAnalysisResult {
  calls?: Array<{ function_name: string; params?: AnalyzedParam[] }>;
  reference_params?: AnalyzedParam[];
}

export interface DependencyRecord {
  param: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  functionName: string;
  calls: AnalyzedCall[];
}

export interface GraphTask {
  absolutePath: string;
  startLine: number;
  endLine: number;
  functionName: string;
  param: string;
  rawParam: string;
  analyzeCall: boolean;
}

export interface GraphTaskResult { dependentTasks: GraphTask[]; }

export interface CallTreeNode { name: string; children: CallTreeNode[]; }

export interface CallTree {
  rootPath: string;
  rootFunctionName: string;
  treeStrLLM: string;
  treeStrRead: string;
}

export interface FunctionReference {
  functionName: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  callFunctionName: string;
}

export interface FunctionCall {
  functionName: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
}

export interface FunctionAnalysisResult {
  references: FunctionReference[];
  calls: FunctionCall[];
}
