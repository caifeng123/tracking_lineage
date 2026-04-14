export function buildProjectAnalyzePrompt(resultDir: string): string {
  return `## 任务
分析当前业务代码仓库，输出技术栈和业务代码目录。

## 步骤
1. 识别技术栈 — iOS / Android / FE
2. 定位业务代码目录（最大的包含业务逻辑的目录）
3. 输出到 ${resultDir}/1-projectAnalyze/overview.md

## 输出格式
技术栈：iOS / Android / FE
业务代码目录：
- src/
- pages/

## 注意
- 仅列出业务代码相对路径
- 排除工程配置、测试、构建产物`
}
