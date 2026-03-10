import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { FileResultStore } from '../src/storage/FileResultStore.js';

const TEST_DIR = join(process.cwd(), '.test-result-store');

describe('FileResultStore', () => {
  let store: FileResultStore;

  beforeEach(() => { store = new FileResultStore(TEST_DIR); });
  afterEach(() => { rmSync(TEST_DIR, { recursive: true, force: true }); });

  it('should save and load content', () => {
    store.save('test/hello.txt', 'world');
    expect(store.load('test/hello.txt')).toBe('world');
  });

  it('should return null for non-existent key', () => {
    expect(store.load('non-existent')).toBeNull();
  });

  it('should check existence', () => {
    store.save('exists.txt', 'data');
    expect(store.exists('exists.txt')).toBe(true);
    expect(store.exists('nope.txt')).toBe(false);
  });

  it('should append content', () => {
    store.append('log.jsonl', 'line1\n');
    store.append('log.jsonl', 'line2\n');
    expect(store.load('log.jsonl')).toBe('line1\nline2\n');
  });

  it('should list directory contents', () => {
    store.save('dir/a.txt', 'a');
    store.save('dir/b.txt', 'b');
    const items = store.list('dir');
    expect(items.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('should return empty array for non-existent dir', () => {
    expect(store.list('nope')).toEqual([]);
  });
});
