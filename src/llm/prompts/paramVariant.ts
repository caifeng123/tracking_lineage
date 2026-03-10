export function buildParamVariantSearchPrompt(param: string, resultDir: string): string {
  return `你是代码参数命名变体检测专家。

## 任务
在仓库业务代码中找到 "${param}" 的所有命名变体。

## 步骤
1. 读取 ${resultDir}/1-projectAnalyze/overview.md 确认业务目录
2. 搜索 camelCase/PascalCase/snake_case/缩写/复数变体
3. 保存到 ${resultDir}/2-aiParamVariant/${param}.json

## 输出
JSON 数组: ["${param}", "variant1", ...]
不含多余字段，仅业务代码目录内搜索。`;
}

export function buildParamRegexGenPrompt(): string {
  return `你是代码参数命名变体检测专家。
根据用户提供的参数名生成 JS 正则列表，匹配各种命名变体。
直接输出 JSON 数组，正则全小写。
示例: [_]?scene[_]?id(s)?", "ecomsceneid(s)?"]`;
}

export function buildParamVariantUserPrompt(param: string): string {
  return `找一下 ${param} 字段的变体`;
}

export function buildParamRegexUserPrompt(param: string): string {
  return `生成一下 ${param} 字段的变体正则表达式列表`;
}
