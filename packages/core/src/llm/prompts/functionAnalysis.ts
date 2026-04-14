import type { FunctionCall } from '../../types/index.js';

export interface FunctionAnalysisInput { param: string; calls: FunctionCall[]; }

export function buildFunctionAnalysisPrompt(input: FunctionAnalysisInput): string {
  const callList = input.calls
    .map((c) => `- ${c.functionName} (${c.absolutePath}:${c.startLine})`)
    .join('\n');
  const callNames = input.calls.map((c) => c.functionName).join(', ');

  return `你是 TypeScript/JavaScript 静态分析专家。根据函数源码分析指定参数的数据流向。

## 用户消息说明
用户消息即为待分析的**函数源码**，请基于该代码进行分析。

## 目标参数
\`${input.param}\`

## AST 已识别的子函数调用
${callList || '（无子函数调用）'}

## 分析维度

### 1. 向上追踪（reference_params）
判断目标参数是否来源于当前函数的形参：
- 若目标参数的值直接或间接来自某个形参（包括解构、属性访问、重命名），记录该形参
- 若目标参数不来源于任何形参（如来自全局变量、模块导入、硬编码），输出空数组

### 2. 向下追踪（calls）
判断目标参数是否被传递给了上述子函数：
- **仅分析上方列出的子函数**：[${callNames}]
- 忽略所有原生/标准库函数（如 console.log, Array.map, Object.assign, JSON.stringify, setTimeout 等）
- 若目标参数未传递给任何子函数，输出空数组

## 特殊模式处理
- **解构赋值**：\`const { sceneId } = params\` → 追踪 sceneId 与 params 的关系
- **属性访问**：\`obj.sceneId\` 与 \`sceneId\` 视为同一参数的不同形态
- **条件传递**：\`flag ? foo(id) : bar(id)\` → 两个调用都应记录
- **Spread 传递**：\`doSomething(...args)\` → 若 args 包含目标参数则记录，index 设为 -1
- **闭包传递**：\`items.map(x => process(x.id))\` → 若 x.id 与目标参数相关则记录 process

## 输出格式（严格 JSON，不含任何多余文字）
{
  "calls": [
    {
      "function_name": "子函数名",
      "params": [
        {
          "name": "实参变量名",
          "index": 0,
          "reason": "简要说明传递关系"
        }
      ]
    }
  ],
  "reference_params": [
    {
      "name": "形参名",
      "index": 0,
      "reason": "简要说明来源关系"
    }
  ]
}

## 字段说明
- **function_name**：必须是上方列出的子函数之一，严禁自行添加
- **name**：变量名（解构路径写完整，如 "props.sceneId"）
- **index**：形参/实参在签名/调用中的位置（从 0 开始），spread 传递时设为 -1
- **reason**：一句话说明数据流关系

## 约束
- 仅输出合法 JSON，禁止包含 Markdown 标记、代码围栏或解释文字
- 仅当参数确实存在数据流关系时才记录，疑似或间接关联不记录
- 无相关项时输出空数组，不要编造。仅输出确实存在数据流关系的项
- function_name 必须严格匹配上方列出的子函数名`;
}

export function buildCallsOnlyPrompt(input: FunctionAnalysisInput): string {
  const callList = input.calls
    .map((c) => `- ${c.functionName} (${c.absolutePath}:${c.startLine})`)
    .join('\n');
  const callNames = input.calls.map((c) => c.functionName).join(', ');

  return `你是 TypeScript/JavaScript 静态分析专家。根据函数源码分析指定参数在子函数调用中的传递。

## 用户消息说明
用户消息即为待分析的**函数源码**，请基于该代码进行分析。

## 目标参数
\`${input.param}\`

## AST 已识别的子函数调用
${callList || '（无子函数调用）'}

## 分析范围
**仅分析**上方列出的子函数：[${callNames}]
忽略所有原生/标准库函数（如 console.log, Array.map, Object.assign, JSON.stringify, setTimeout 等）

## 特殊模式处理
- **解构赋值**：\`const { sceneId } = params\` → 追踪 sceneId 与 params 的关系
- **属性访问**：\`obj.sceneId\` 与 \`sceneId\` 视为同一参数的不同形态
- **条件传递**：\`flag ? foo(id) : bar(id)\` → 两个调用都应记录
- **Spread 传递**：\`doSomething(...args)\` → 若 args 包含目标参数则记录，index 设为 -1
- **闭包传递**：\`items.map(x => process(x.id))\` → 若 x.id 与目标参数相关则记录 process

## 输出格式（严格 JSON，不含任何多余文字）
{
  "calls": [
    {
      "function_name": "子函数名",
      "params": [
        {
          "name": "实参变量名",
          "index": 0,
          "reason": "简要说明传递关系"
        }
      ]
    }
  ]
}

## 字段说明
- **function_name**：必须是上方列出的子函数之一，严禁自行添加
- **name**：传递时使用的实参变量名
- **index**：实参在调用表达式中的位置（从 0 开始），spread 传递时设为 -1
- **reason**：一句话说明传递关系

## 约束
- 仅输出合法 JSON，禁止包含 Markdown 标记、代码围栏或解释文字
- 仅当参数确实存在数据流关系时才记录，疑似或间接关联不记录
- 无相关项时输出空数组，不要编造。仅输出确实存在数据流关系的项
- function_name 必须严格匹配上方列出的子函数名`;
}