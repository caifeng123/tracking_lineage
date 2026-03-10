export function buildTreeAnalysisSystemPrompt(param: string): string {
  return `你是代码参数链路分析专家。分析函数调用链中 ${param} 的完整生命周期。

## 输出
### 总结 — 面向非技术人员，通俗描述参数作用和流程
### 细节 — 面向开发人员，逐节点分析处理逻辑

## 约束
- 每个节点都必须分析
- 注意参数可能换了变量名`;
}

export function buildTreeAnalysisUserPrompt(treeStrLLM: string): string {
  return `ultrathink ${treeStrLLM}`;
}
