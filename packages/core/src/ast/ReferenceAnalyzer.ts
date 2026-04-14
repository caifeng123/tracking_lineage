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

/**
 * [FIX-1] 获取可以调用 findReferences 的节点。
 *
 * ArrowFunction / FunctionExpression 本身是表达式节点，没有 findReferences 方法。
 * 需要向上查找其父级 VariableDeclaration 的 NameNode，或 PropertyAssignment 的 NameNode，
 * 在命名节点上才能调用 findReferences()。
 */
function getReferencableNode(funcDecl: Node): Node | null {
  const kind = funcDecl.getKind();

  // FunctionDeclaration / MethodDeclaration 本身就是命名声明，直接用其 NameNode
  if (kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration) {
    const nameNode = (funcDecl as any).getNameNode?.();
    return nameNode ?? null;
  }

  // ArrowFunction / FunctionExpression → 向上找父级声明的 NameNode
  if (kind === SyntaxKind.ArrowFunction || kind === SyntaxKind.FunctionExpression) {
    const parent = funcDecl.getParent();
    if (!parent) return null;
    const pk = parent.getKind();

    // const foo = () => {} → VariableDeclaration → NameNode
    if (pk === SyntaxKind.VariableDeclaration) {
      return (parent as any).getNameNode?.() ?? null;
    }
    // { foo: () => {} } → PropertyAssignment → NameNode
    if (pk === SyntaxKind.PropertyAssignment) {
      return (parent as any).getNameNode?.() ?? null;
    }
    // export default () => {} → 无命名，无法追踪
    return null;
  }

  // MethodSignature / PropertyAssignment 等，尝试 NameNode
  const nameNode = (funcDecl as any).getNameNode?.();
  return nameNode ?? null;
}

function findReferences(funcDecl: Node, functionName: string): FunctionReference[] {
  const rawRefs: Array<{ callFunctionName: string; absolutePath: string; startLine: number }> = [];
  const seen = new Set<string>();

  // [FIX-1] 使用 getReferencableNode 获取可调用 findReferences 的节点
  const refNode = getReferencableNode(funcDecl);
  const refs = refNode ? (refNode as any).findReferences?.() : undefined;
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

    // [FIX-2] 如果定义落在 import 行上，穿透追踪到真实源定义
    const resolved = resolveImportDefinition(def, dfp, defLine);
    if (!resolved) continue;

    const targetFunc = findFuncNodeNear(resolved.sourceFile, resolved.line);
    if (!targetFunc) continue;

    const startLine = targetFunc.getStartLineNumber();
    const endLine = targetFunc.getEndLineNumber();
    const resolvedPath = resolved.sourceFile.getFilePath();

    const key = `${name}:${resolvedPath}:${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push({ functionName: name, absolutePath: resolvedPath, startLine, endLine });
  }
  return calls;
}

/**
 * [FIX-2] 穿透 import 解析。
 *
 * 当 getDefinitions() 返回的定义位于 import/re-export 语句上时，
 * 需要继续追踪到实际的函数源码定义。
 *
 * 策略：
 *   1. 检查 defNode 是否位于 ImportDeclaration / ExportDeclaration 内
 *   2. 如果是，在 defNode（ImportSpecifier / NamedExport specifier）上再次调用
 *      getDefinitions()，获取下一跳的真实定义
 *   3. 最多追踪 5 层 re-export（防止循环）
 *   4. 如果最终定义仍然在 node_modules / .d.ts 中，返回 null
 */
function resolveImportDefinition(
  def: any,
  dfp: string,
  defLine: number,
  depth: number = 0,
): { sourceFile: SourceFile; line: number } | null {
  if (depth > 5) return null;

  const defNode = def.getNode();
  const sf = def.getSourceFile();

  // 检查是否在 import / re-export 内
  if (!isNodeInsideImportOrReExport(defNode)) {
    // 不在 import 里，就是真正的定义
    if (dfp.includes('node_modules') || dfp.includes('typescript/lib') || dfp.endsWith('.d.ts')) {
      return null;
    }
    return { sourceFile: sf, line: defLine };
  }

  // 在 import/re-export 内，继续追踪
  // 尝试在 defNode 上调用 getDefinitions 获取下一跳
  const nextDefs = (defNode as any).getDefinitions?.();
  if (!nextDefs || nextDefs.length === 0) {
    // 某些节点本身没有 getDefinitions，尝试找其 NameNode
    const nameNode = (defNode as any).getNameNode?.();
    if (nameNode) {
      const nameNextDefs = (nameNode as any).getDefinitions?.();
      if (nameNextDefs && nameNextDefs.length > 0) {
        const nextDef = nameNextDefs[0];
        const nextDfp = nextDef.getSourceFile().getFilePath();
        const nextLine = nextDef.getNode().getStartLineNumber();
        return resolveImportDefinition(nextDef, nextDfp, nextLine, depth + 1);
      }
    }

    // 回退：用 ts-morph 的类型系统追踪 ImportSpecifier
    const importSpecifier = findAncestor(defNode, SyntaxKind.ImportSpecifier);
    if (importSpecifier) {
      const symbol = (importSpecifier as any).getSymbol?.();
      const aliasedSymbol = symbol?.getAliasedSymbol?.();
      if (aliasedSymbol) {
        const declarations = aliasedSymbol.getDeclarations();
        if (declarations && declarations.length > 0) {
          const realDecl = declarations[0];
          const realSf = realDecl.getSourceFile();
          const realPath = realSf.getFilePath();
          if (realPath.includes('node_modules') || realPath.includes('typescript/lib') || realPath.endsWith('.d.ts')) {
            return null;
          }
          return { sourceFile: realSf, line: realDecl.getStartLineNumber() };
        }
      }
    }

    return null;
  }

  const nextDef = nextDefs[0];
  const nextDfp = nextDef.getSourceFile().getFilePath();
  const nextLine = nextDef.getNode().getStartLineNumber();
  return resolveImportDefinition(nextDef, nextDfp, nextLine, depth + 1);
}

/**
 * 检查节点是否位于 ImportDeclaration 或 ExportDeclaration（re-export）内
 */
function isNodeInsideImportOrReExport(node: Node): boolean {
  let cur: Node | undefined = node;
  while (cur) {
    const k = cur.getKind();
    if (
      k === SyntaxKind.ImportDeclaration ||
      k === SyntaxKind.ImportEqualsDeclaration ||
      k === SyntaxKind.ExportDeclaration
    ) {
      return true;
    }
    // 到了 SourceFile 级别就停
    if (k === SyntaxKind.SourceFile) break;
    cur = cur.getParent();
  }
  return false;
}

/**
 * 向上查找指定 SyntaxKind 的祖先节点
 */
function findAncestor(node: Node, kind: SyntaxKind): Node | null {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (cur.getKind() === kind) return cur;
    if (cur.getKind() === SyntaxKind.SourceFile) break;
    cur = cur.getParent();
  }
  return null;
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
