import { execSync } from 'child_process';
import { join } from 'path';

export interface LineCommitInfo { lineAuthor: string; lineDate: string; }
export interface FileCommitInfo { fileAuthor: string; fileDate: string; }

export class GitService {
  private readonly cwd: string;
  constructor(cwd: string = process.cwd()) { this.cwd = cwd; }

  getLineCommitInfo(filePath: string, lineNumber: number): LineCommitInfo | null {
    try {
      if (lineNumber <= 0) {
        const fi = this.getFileLastCommitInfo(filePath);
        return fi ? { lineAuthor: fi.fileAuthor, lineDate: fi.fileDate } : null;
      }
      const absPath = join(this.cwd, filePath);
      const output = execSync(`git blame -L ${lineNumber},${lineNumber} "${absPath}"`, { encoding: 'utf-8', stdio: 'pipe', cwd: this.cwd });
      const m = output.match(/\((.*?) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})/);
      if (!m) return null;
      return { lineAuthor: m[1].trim(), lineDate: m[2].trim() };
    } catch { return null; }
  }

  getFileLastCommitInfo(filePath: string): FileCommitInfo | null {
    try {
      const absPath = join(this.cwd, filePath);
      const output = execSync(`git log -1 --format="%an|%ad" --date=format:"%Y-%m-%d %H:%M:%S" -- "${absPath}"`, { encoding: 'utf-8', stdio: 'pipe', cwd: this.cwd });
      const parts = output.trim().split('|');
      if (parts.length < 2 || !parts[0] || !parts[1]) return null;
      return { fileAuthor: parts[0].trim(), fileDate: parts[1].trim() };
    } catch { return null; }
  }

  getRepoName(): string {
    try {
      const url = execSync('git config --get remote.origin.url', { encoding: 'utf-8', cwd: this.cwd }).trim();
      const m = url.match(/:(.+)\.git$/);
      return m?.[1] ?? '';
    } catch { return ''; }
  }

  getCurrentCommitId(): string {
    try { return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: this.cwd }).trim(); }
    catch { return ''; }
  }
}
