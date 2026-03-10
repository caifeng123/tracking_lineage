import type { DependencyRecord, CallTree, CallTreeNode } from '../types/index.js';

export function buildFunctionCallTrees(callList: DependencyRecord[]): CallTree[] {
  if (callList.length === 0) return [];
  const { functionMap, calledFunctions } = buildFunctionMap(callList);
  const rootNodes = findRootNodes(functionMap, calledFunctions);
  return rootNodes.map((root) => {
    const tree = buildTree(root, functionMap, new Set());
    const lines = printTree(tree);
    return {
      rootPath: `${root.absolutePath}:${root.startLine}`,
      rootFunctionName: root.functionName,
      treeStrLLM: lines.join('\n'),
      treeStrRead: lines.map(simplifyLine).join('\n'),
    };
  });
}

function funcId(rec: { absolutePath: string; startLine: number }): string {
  return `${rec.absolutePath}:${rec.startLine}`;
}

function buildFunctionMap(callList: DependencyRecord[]) {
  const functionMap = new Map<string, DependencyRecord>();
  const calledFunctions = new Set<string>();
  for (const func of callList) {
    functionMap.set(funcId(func), func);
    for (const call of func.calls) calledFunctions.add(funcId(call));
  }
  return { functionMap, calledFunctions };
}

function findRootNodes(functionMap: Map<string, DependencyRecord>, calledFunctions: Set<string>): DependencyRecord[] {
  const roots: DependencyRecord[] = [];
  for (const [id, func] of functionMap) {
    if (!calledFunctions.has(id)) roots.push(func);
  }
  return roots;
}

function buildTree(func: DependencyRecord, functionMap: Map<string, DependencyRecord>, visited: Set<string>): CallTreeNode {
  const id = funcId(func);
  if (visited.has(id)) return { name: `${func.functionName} (${id}) [CYCLE]`, children: [] };
  visited.add(id);
  const node: CallTreeNode = { name: `${func.functionName} (${id})`, children: [] };
  for (const call of func.calls) {
    const calledFunc = functionMap.get(funcId(call));
    if (calledFunc) node.children.push(buildTree(calledFunc, functionMap, visited));
  }
  visited.delete(id);
  return node;
}

function printTree(node: CallTreeNode, prefix = '', isLast = true, lines: string[] = []): string[] {
  const connector = isLast ? '└── ' : '├── ';
  lines.push(prefix + connector + node.name);
  for (let i = 0; i < node.children.length; i++) {
    const childIsLast = i === node.children.length - 1;
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    printTree(node.children[i], childPrefix, childIsLast, lines);
  }
  return lines;
}

function simplifyLine(line: string): string {
  return line.replace(/([^(]+)\/(.+):(\d+)/g, (_m, _p: string, file: string, ln: string) => `${file}:${ln}`);
}
