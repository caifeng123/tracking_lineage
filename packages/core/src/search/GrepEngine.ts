import fs from 'fs';
import path from 'path';
import ignore, { type Ignore } from 'ignore';

export interface GrepMatch { match: string; line: number; column: number; }
export interface GrepFileResult { file: string; matches: GrepMatch[]; }

const CODE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue']);

export class GrepEngine {
  private readonly rootDir: string;
  private readonly ig: Ignore;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.ig = this.buildIgnore();
  }

  searchRepo(regexPattern: string): GrepFileResult[] {
    const regex = new RegExp(`\\b${regexPattern}\\b`, 'gi');
    return this.scanDir(this.rootDir, regex);
  }

  private buildIgnore(): Ignore {
    const ig = ignore();
    ig.add(['.git', 'node_modules', '.sdk', '.result', 'dist', 'build']);
    const gitignorePath = path.join(this.rootDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
    return ig;
  }

  private scanDir(dirPath: string, regex: RegExp): GrepFileResult[] {
    const results: GrepFileResult[] = [];
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return results; }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(this.rootDir, fullPath);
      if (this.ig.ignores(relPath)) continue;
      if (entry.isDirectory()) { results.push(...this.scanDir(fullPath, regex)); }
      else if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        const matches = this.searchInFile(fullPath, regex);
        if (matches.length > 0) results.push({ file: fullPath, matches });
      }
    }
    return results;
  }

  private searchInFile(filePath: string, regex: RegExp): GrepMatch[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches: GrepMatch[] = [];
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        const idx = m.index;
        const beforeText = content.substring(0, idx);
        const lineNum = beforeText.split('\n').length;
        const lastNl = content.lastIndexOf('\n', idx);
        const col = idx - (lastNl === -1 ? 0 : lastNl + 1) + 1;
        matches.push({ match: m[0], line: lineNum, column: col });
      }
      return matches;
    } catch { return []; }
  }
}
