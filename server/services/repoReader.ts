import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative, extname } from 'path';

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.jsx': 'javascriptreact',
  '.vue': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml',
  '.html': 'html', '.xml': 'xml', '.sh': 'shell',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
};

export class RepoReader {
  private readonly targetDir: string;
  private readonly analysisDir: string;

  constructor(targetDir: string, analysisDir: string) {
    this.targetDir = resolve(targetDir);
    this.analysisDir = resolve(analysisDir);
  }

  /**
   * 将分析时的绝对路径转换为当前仓库的绝对路径
   */
  resolvePath(analysisAbsPath: string): string {
    if (this.targetDir === this.analysisDir) return analysisAbsPath;
    // 前缀替换
    if (analysisAbsPath.startsWith(this.analysisDir)) {
      return analysisAbsPath.replace(this.analysisDir, this.targetDir);
    }
    // 如果是相对路径，直接 join
    return join(this.targetDir, analysisAbsPath);
  }

  /**
   * 将绝对路径转为相对路径
   */
  toRelative(absPath: string): string {
    const resolved = this.resolvePath(absPath);
    return relative(this.targetDir, resolved);
  }

  /**
   * 读取文件内容
   */
  readFile(relPath: string): { content: string; totalLines: number; language: string } | null {
    const absPath = this.safePath(relPath);
    if (!absPath || !existsSync(absPath)) return null;

    try {
      const content = readFileSync(absPath, 'utf-8');
      const totalLines = content.split('\n').length;
      const ext = extname(relPath).toLowerCase();
      const language = LANG_MAP[ext] ?? 'plaintext';
      return { content, totalLines, language };
    } catch {
      return null;
    }
  }

  /**
   * 构建目录树（只展开包含 involved 文件的目录）
   */
  buildFileTree(involvedFiles: string[]): DirNode {
    const involvedSet = new Set(involvedFiles.map((f) => f.replace(/\\/g, '/')));

    // 收集需要展开的目录
    const involvedDirs = new Set<string>();
    for (const file of involvedSet) {
      const parts = file.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        involvedDirs.add(current);
      }
    }

    return this.buildDirNode('', '', involvedSet, involvedDirs);
  }

  private buildDirNode(
    name: string,
    relativePath: string,
    involvedFiles: Set<string>,
    involvedDirs: Set<string>,
  ): DirNode {
    const absPath = relativePath
      ? join(this.targetDir, relativePath)
      : this.targetDir;

    const node: DirNode = {
      name: name || this.targetDir.split('/').pop() || 'repo',
      path: relativePath,
      type: 'directory',
      involved: false,
      children: [],
    };

    let entries: string[];
    try {
      entries = readdirSync(absPath);
    } catch {
      return node;
    }

    // 过滤隐藏文件和 node_modules
    entries = entries
      .filter((e) => !e.startsWith('.') && e !== 'node_modules' && e !== 'dist')
      .sort();

    for (const entry of entries) {
      const childRel = relativePath ? `${relativePath}/${entry}` : entry;
      const childAbs = join(absPath, entry);

      let stat;
      try {
        stat = statSync(childAbs);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // 只展开包含 involved 文件的目录
        if (involvedDirs.has(childRel.replace(/\\/g, '/'))) {
          const dirNode = this.buildDirNode(entry, childRel, involvedFiles, involvedDirs);
          dirNode.involved = true;
          node.children!.push(dirNode);
        } else {
          node.children!.push({
            name: entry,
            path: childRel,
            type: 'directory',
            involved: false,
          });
        }
      } else if (stat.isFile()) {
        const normalizedRel = childRel.replace(/\\/g, '/');
        node.children!.push({
          name: entry,
          path: childRel,
          type: 'file',
          involved: involvedFiles.has(normalizedRel),
        });
      }
    }

    return node;
  }

  /**
   * 安全路径检查，防止路径穿越
   */
  private safePath(relPath: string): string | null {
    const abs = resolve(this.targetDir, relPath);
    if (!abs.startsWith(this.targetDir)) return null;
    return abs;
  }
}

export interface DirNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  involved: boolean;
  children?: DirNode[];
}
