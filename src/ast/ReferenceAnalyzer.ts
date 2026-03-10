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
    if (expr.getKind() !== SyntaxKind.Identifier) continue;
    const name = expr.getText();
    const defs = (expr as any).getDefinitions?.();
    if (!defs || defs.length === 0) continue;
    const def = defs[0];
    const dfp = def.getSourceFile().getFilePath();
    if (dfp.includes('node_modules') || dfp.includes('typescript/lib') || dfp.endsWith('.d.ts')) continue;
    const tf = def.getSourceFile().getFunctions().find((f: any) => f.getName() === name);
    const dsl = tf ? tf.getStartLineNumber() : def.getNode().getStartLineNumber();
    const del = tf ? tf.getEndLineNumber() : def.getNode().getEndLineNumber();
    const key = `${name}:${dfp}:${dsl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push({ functionName: name, absolutePath: dfp, startLine: dsl, endLine: del });
  }
  return calls;
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
