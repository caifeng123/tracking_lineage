export interface IResultStore {
  exists(key: string): boolean;
  save(key: string, content: string): void;
  append(key: string, content: string): void;
  load(key: string): string | null;
  ensureDir(key: string): void;
  list(prefix: string): string[];
}
