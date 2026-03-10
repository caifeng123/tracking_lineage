import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs';
import path from 'path';
import type { IResultStore } from './IResultStore.js';

export class FileResultStore implements IResultStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    mkdirSync(this.rootDir, { recursive: true });
  }

  private resolve(key: string): string { return path.join(this.rootDir, key); }

  exists(key: string): boolean { return existsSync(this.resolve(key)); }

  save(key: string, content: string): void {
    const p = this.resolve(key);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf-8');
  }

  append(key: string, content: string): void {
    const p = this.resolve(key);
    mkdirSync(path.dirname(p), { recursive: true });
    appendFileSync(p, content, 'utf-8');
  }

  load(key: string): string | null {
    const p = this.resolve(key);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf-8');
  }

  ensureDir(key: string): void { mkdirSync(this.resolve(key), { recursive: true }); }

  list(prefix: string): string[] {
    const d = this.resolve(prefix);
    if (!existsSync(d)) return [];
    return readdirSync(d);
  }
}
