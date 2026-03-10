import { SyntaxKind, type SourceFile, type Node } from 'ts-morph';
import { ProjectManager } from './ProjectManager.js';
import { findMethodsByLines } from './FunctionLocator.js';
import type { FunctionReference, FunctionCall, FunctionAnalysisResult } from '../types/index.js';

export function analyzeFunction(absolutePath: string, startLine: number): FunctionAnalysisResult {
  const project = ProjectManager.getProject(absolutePath);
  const sourceFile: SourceFile | undefined = project.getSourceFile(absolutePath);
  if (!sourceFile) { console.warn(`Source file not found: ${absolutePath}`); return { references: [], calls: [] }; }

  const funcDecl = findFunctionByLine(sourceFile, startLine);
  if (!funcDecl) { console.warn(`Function not found at ${absolutePath}:${startLine}`); return { references: [], calls: [] }; }

  const functionName = (funcDecl as any).getName?.() ?? 'anonymous';
  const references = findReferences(funcDecl, functionName);
  const calls = findCalls(funcDecl);
  return { references, calls };
}

function findFunctionByLine(sf: SourceFile, sl: number): Node | null {
  const kinds = [SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.MethodDeclaration, SyntaxKind.MethodSignature, SyntaxKind.PropertyAssignment];
  for (const kind of kinds) { for (const n of sf.getDescendantsOfKind(kind)) { if (n.getStartLineNumber() === sl) return n; } }
  return null;
}

function findReferences(funcDecl: Node, functionName: string): FunctionReference[] {
  const rawRefs: Array<{ callFunctionName: string; absolutePath: string; startLine: number }> = [];
  const seen = new Set<string>();
  const refs = (funcDecl as any).findReferences?.();
  if (!refs) return [];
  for (const rg of refs) {
    for (const r of rg.getReferences()) {
      if (r.isDefinition()) continue;
      const rn = r.getNode();
      const fp = rn.getSourceFile().getFilePath();
      const rl = rn.getStartLineNumber();
      if (isInsideImport(rn)) continue;
      const key = `${fp}:${rl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rawRefs.push({ callFunctionName: functionName, absolutePath: fp, startLine: rl });
    }
  }
  const result: FunctionReference[] = [];
  const byFile = new Map<string, typeof rawRefs>();
  for (const ref of rawRefs) { const l = byFile.get(ref.absolutePath) ?? []; l.push(ref); byFile.set(ref.absolutePath, l); }
  for (const [filePath, fileRefs] of byFile) {
    const lines = fileRefs.map((r) => r.startLine);
    const locations = findMethodsByLines(filePath, lines);
    for (let i = 0; i < fileRefs.length; i++) {
      const loc = locations[i];
      if (loc.paramLocationType === 'type' || loc.paramLocationType.startsWith('comment') || loc.paramLocationType === 'import' || loc.paramLocationType === 'require') continue;
      result.push({ functionName: loc.functionName, absolutePath: filePath, startLine: loc.startLine, endLine: loc.endLine, callFunctionName: fileRefs[i].callFunctionName });
    }
  }
  return result;
}

function findCalls(funcDecl: Node): FunctionCall[] {
  const calls: FunctionCall[] = [];
  const seen = new Set<string>();
  for (const ce of funcDecl.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = ce.getExpression();
    const kind = expr.getKind();

    // 支持 foo() / obj.method() / this.method() / a.b.c()
    let name: string;
    let resolveNode: Node;
    if (kind === SyntaxKind.Identifier) {
      name = expr.getText();
      resolveNode = expr;
    } else if (kind === SyntaxKind.PropertyAccessExpression) {
      const nameNode = (expr as any).getNameNode?.();
      if (!nameNode) continue;
      name = nameNode.getText();
      resolveNode = nameNode;
    } else {
      continue;
    }

    // 尝试获取定义
    const defs = (resolveNode as any).getDefinitions?.();
    if (!defs || defs.length === 0) continue;
    const def = defs[0];
    const dfp = def.getSourceFile().getFilePath();
    if (dfp.includes('node_modules') || dfp.includes('typescript/lib') || dfp.endsWith('.d.ts')) continue;

    const defNode = def.getNode();
    const defLine = defNode.getStartLineNumber();

    // 关键：用 findFunctionByLine 相同的逻辑定位函数节点
    // 这样 startLine 和后续 analyzeFunction 调用时一定能匹配上
    const targetFunc = findFuncNodeNear(def.getSourceFile(), defLine);
    if (!targetFunc) continue;

    const startLine = targetFunc.getStartLineNumber();
    const endLine = targetFunc.getEndLineNumber();

    const key = `${name}:${dfp}:${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push({ functionName: name, absolutePath: dfp, startLine, endLine });
  }
  return calls;
}

/**
 * 从定义行号附近查找包含该行的函数节点。
 * 与 findFunctionByLine 使用完全相同的 SyntaxKind 列表，
 * 确保返回的 startLine 和 analyzeFunction 能精确匹配。
 */
function findFuncNodeNear(sf: SourceFile, line: number): Node | null {
  const kinds = [
    SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction, SyntaxKind.MethodDeclaration,
    SyntaxKind.MethodSignature, SyntaxKind.PropertyAssignment,
  ];
  // 精确匹配：函数起始行 === 定义行
  for (const k of kinds) {
    for (const n of sf.getDescendantsOfKind(k)) {
      if (n.getStartLineNumber() === line) return n;
    }
  }
  // 包含匹配：定义行在函数范围内（取最内层）
  let best: Node | null = null;
  for (const k of kinds) {
    for (const n of sf.getDescendantsOfKind(k)) {
      const s = n.getStartLineNumber();
      const e = n.getEndLineNumber();
      if (s <= line && line <= e) {
        if (!best || (n.getEnd() - n.getStart()) < (best.getEnd() - best.getStart())) {
          best = n;
        }
      }
    }
  }
  return best;
}

function isInsideImport(node: Node): boolean {
  let cur: Node | undefined = node;
  while (cur) {
    const k = cur.getKind();
    if (k === SyntaxKind.ImportDeclaration || k === SyntaxKind.ImportClause || k === SyntaxKind.NamedImports || k === SyntaxKind.ImportSpecifier) return true;
    cur = cur.getParent();
  }
  return false;
}
