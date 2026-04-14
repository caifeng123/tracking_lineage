import { SyntaxKind, type SourceFile, type Node } from 'ts-morph';
import { readFileSync } from 'fs';
import { ProjectManager } from './ProjectManager.js';
import type { FunctionLocation, ParamLocationType } from '../types/index.js';

interface LineTarget { targetLine: number; paramLocation: string; result: FunctionLocation | null; innermostFunction: Node | null; }

export function findMethodsByLines(filePath: string, targetLines: number[]): FunctionLocation[] {
  const fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split(/\r?\n/);
  const sorted = [...targetLines].sort((a, b) => a - b);
  const targets: LineTarget[] = sorted.map((line) => ({ targetLine: line, paramLocation: `${filePath}:${line}`, result: null, innermostFunction: null }));

  const project = ProjectManager.getProject(filePath);
  const sourceFile: SourceFile | undefined = project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  let cursor = 0;

  sourceFile.forEachDescendant((node) => {
    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    while (cursor < targets.length && targets[cursor].targetLine < startLine) cursor++;

    for (let i = cursor; i < targets.length; i++) {
      const t = targets[i];
      if (t.targetLine > endLine) break;
      if (t.targetLine < startLine) continue;
      const kind = node.getKind();

      if (kind === SyntaxKind.ImportDeclaration || kind === SyntaxKind.ImportEqualsDeclaration) {
        t.result = loc(filePath, 'import', 'import', startLine, endLine, t.paramLocation);
      } else if (kind === SyntaxKind.CallExpression) {
        const expr = (node as any).getExpression?.();
        if (expr?.getText() === 'require') t.result = loc(filePath, 'require', 'require', startLine, endLine, t.paramLocation);
      } else if (kind === SyntaxKind.InterfaceDeclaration || kind === SyntaxKind.TypeAliasDeclaration || kind === SyntaxKind.EnumDeclaration || kind === SyntaxKind.ClassDeclaration) {
        if (!t.result) t.result = loc(filePath, 'type', (node as any).getName?.() ?? 'AnonymousType', startLine, endLine, t.paramLocation);
      } else if (isFuncKind(kind)) {
        if (isAnon(node)) return;
        if (!t.innermostFunction || (startLine >= t.innermostFunction.getStartLineNumber() && endLine <= t.innermostFunction.getEndLineNumber())) {
          t.innermostFunction = node;
        }
      }
    }
  });

  return targets.map((t) => {
    const ct = detectComment(lines, t.targetLine);
    if (ct) return loc(filePath, ct, 'comment', -2, -2, t.paramLocation);
    if (t.innermostFunction) return loc(filePath, 'function', getFnName(t.innermostFunction), t.innermostFunction.getStartLineNumber(), t.innermostFunction.getEndLineNumber(), t.paramLocation);
    if (t.result) return t.result;
    return loc(filePath, 'global', 'N/A', -1, -1, t.paramLocation);
  });
}

function loc(fp: string, type: ParamLocationType, name: string, sl: number, el: number, pl: string): FunctionLocation {
  return { filePath: fp, paramLocationType: type, functionName: name, startLine: sl, endLine: el, paramLocation: pl };
}
function isFuncKind(k: SyntaxKind): boolean { return k === SyntaxKind.FunctionDeclaration || k === SyntaxKind.FunctionExpression || k === SyntaxKind.ArrowFunction || k === SyntaxKind.MethodDeclaration; }
function isAnon(node: Node): boolean {
  const k = node.getKind();
  if (k === SyntaxKind.MethodDeclaration || k === SyntaxKind.FunctionDeclaration) return !(node as any).getName?.();
  if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
    if ((node as any).getName?.()) return false;
    const p = node.getParent();
    if (p && (p.getKind() === SyntaxKind.VariableDeclaration || p.getKind() === SyntaxKind.PropertyAssignment)) return !(p as any).getName?.();
    return true;
  }
  return false;
}
function getFnName(node: Node): string {
  const k = node.getKind();
  if (k === SyntaxKind.MethodDeclaration || k === SyntaxKind.FunctionDeclaration) return (node as any).getName?.() ?? 'anonymous';
  if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
    const p = node.getParent();
    if (p && (p.getKind() === SyntaxKind.VariableDeclaration || p.getKind() === SyntaxKind.PropertyAssignment)) return (p as any).getName?.() ?? 'anonymous';
    return 'anonymous';
  }
  return 'unknown';
}
function detectComment(lines: string[], targetLine: number): ParamLocationType | null {
  const line = lines[targetLine - 1];
  if (!line) return null;
  if (/^\s*\/\//.test(line)) return 'comment-single';
  if (/^\s*\/\*.*\*\/\s*$/.test(line)) return 'comment-multi';
  let inBlock = false;
  for (let i = 0; i < targetLine; i++) {
    if (lines[i].includes('/*')) inBlock = true;
    if (lines[i].includes('*/')) inBlock = false;
    if (inBlock && i === targetLine - 1) return 'comment-multi';
  }
  return null;
}
