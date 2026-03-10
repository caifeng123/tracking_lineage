import type { FunctionCall } from '../../types/index.js';

export interface FunctionAnalysisInput { param: string; calls: FunctionCall[]; }

export function buildFunctionAnalysisPrompt(input: FunctionAnalysisInput): string {
  const callNames = input.calls.map((c) => c.functionName).join(', ');
  return `你是代码分析专家。分析代码中参数的使用，判断是否需要向上追踪引用和向下追踪调用。

## 待分析参数
${input.param}

## 分析维度
1. 向上：参数是否来源于函数入参
2. 向下：子函数 [${callNames}] 中与参数相关的调用

## 输出（严格 JSON）
{"calls":[{"function_name":"childFunc","params":[{"name":"p","index":0,"reason":"...","use":true}]}],"reference_params":[{"name":"inputParam","index":0,"reason":"...","use":true}]}

## 规则
- calls 数组每个元素必须包含 function_name（子函数名）和 params（传递的参数列表）
- function_name 必须是上面列出的子函数之一
- 只列确实相关的项，忽略 JS 原生函数
- use 需严格校验参数位置一致性`;
}

export function buildCallsOnlyPrompt(input: FunctionAnalysisInput): string {
  const callNames = input.calls.map((c) => c.functionName).join(', ');
  return `你是代码分析专家。分析参数在子函数调用中的传递。

## 待分析参数
${input.param}

## 分析范围
子函数: [${callNames}]

## 输出（严格 JSON）
{"calls":[{"function_name":"childFunc","params":[{"name":"p","index":0,"reason":"...","use":true}]}]}

## 规则
- calls 数组每个元素必须包含 function_name（子函数名）和 params（传递的参数列表）
- function_name 必须是上面列出的子函数之一
- 只列相关调用，忽略原生函数，严格校验 use`;
}
