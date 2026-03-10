// Library entry — 导出所有模块供编程式调用
export { Pipeline } from './pipeline/index.js';
export { ConfigManager } from './config.js';
export { FileResultStore } from './storage/index.js';
export { LLMClient } from './llm/LLMClient.js';
export { AgentClient } from './llm/AgentClient.js';
export { DynamicQueue } from './queue/index.js';
export { GrepEngine } from './search/index.js';
export { GitService } from './git/index.js';
export { buildFunctionCallTrees } from './tree/index.js';
export { ProjectManager, findMethodsByLines, analyzeFunction } from './ast/index.js';

// Re-export types
export type {
  AppConfig,
  LLMConfig,
  ClaudeAgentConfig,
} from './types/config.js';

export type {
  ParamVariantPair,
  FunctionLocation,
  ParamFunctionLocation,
  AnalyzedParam,
  AnalyzedCall,
  DependencyRecord,
  GraphTask,
  CallTreeNode,
  CallTree,
  FunctionReference,
  FunctionCall,
  FunctionAnalysisResult,
  LLMFunctionAnalysisResult,
} from './types/lineage.js';

export type { IResultStore } from './storage/IResultStore.js';
export type { PipelineContext } from './pipeline/types.js';
