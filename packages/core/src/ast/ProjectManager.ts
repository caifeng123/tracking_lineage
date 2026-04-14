import { Project } from 'ts-morph';
import { dirname, resolve, join } from 'path';
import { existsSync } from 'fs';

export class ProjectManager {
  private static cache = new Map<string, Project>();

  static getProject(filePath: string): Project {
    const tsconfig = this.findTsConfig(dirname(resolve(filePath)));
    const key = tsconfig ?? '__NO_TSCONFIG__';
    let project = this.cache.get(key);
    if (!project) {
      project = tsconfig ? new Project({ tsConfigFilePath: tsconfig }) : new Project();
      this.cache.set(key, project);
    }
    return project;
  }

  static findTsConfig(startDir: string): string | null {
    let cur = resolve(startDir);
    while (true) {
      const candidate = join(cur, 'tsconfig.json');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return null;
  }

  static clearCache(): void { this.cache.clear(); }
}
