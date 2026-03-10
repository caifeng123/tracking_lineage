import { describe, it, expect } from 'vitest';
import { DynamicQueue } from '../src/queue/DynamicQueue.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('DynamicQueue', () => {
  it('should process all tasks and resolve start()', async () => {
    const queue = new DynamicQueue<number>(2, 0);
    queue.setIdGenerator((n) => String(n));
    const processed: number[] = [];
    queue.addTasks([1, 2, 3, 4, 5]);
    const stats = await queue.start(async (task) => {
      await delay(10);
      processed.push(task);
    });
    expect(stats.completed).toBe(5);
    expect(stats.failed).toBe(0);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('should deduplicate tasks by ID', async () => {
    const queue = new DynamicQueue<{ id: string; value: number }>(2, 0);
    queue.setIdGenerator((t) => t.id);
    const processed: number[] = [];
    queue.addTasks([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 3 },
    ]);
    await queue.start(async (task) => { processed.push(task.value); });
    expect(processed.sort()).toEqual([1, 2]);
  });

  it('should handle dynamically added tasks', async () => {
    const queue = new DynamicQueue<number>(2, 0);
    queue.setIdGenerator((n) => String(n));
    const processed: number[] = [];
    queue.addTasks([1, 2]);
    const stats = await queue.start(async (task) => {
      processed.push(task);
      if (task === 1) return { dependentTasks: [10, 20] };
      return undefined;
    });
    expect(stats.completed).toBe(4);
    expect(processed).toContain(10);
    expect(processed).toContain(20);
  });

  it('should retry failed tasks', async () => {
    const queue = new DynamicQueue<number>(1, 2);
    queue.setIdGenerator((n) => String(n));
    let attempt = 0;
    queue.addTask(1);
    const stats = await queue.start(async () => {
      attempt++;
      if (attempt < 3) throw new Error('fail');
    });
    expect(stats.completed).toBe(1);
    expect(attempt).toBe(3);
  });

  it('should report failures after max retries', async () => {
    const queue = new DynamicQueue<number>(1, 1);
    queue.setIdGenerator((n) => String(n));
    queue.addTask(1);
    const stats = await queue.start(async () => { throw new Error('always'); });
    expect(stats.failed).toBe(1);
    expect(stats.completed).toBe(0);
  });

  it('should resolve immediately for empty queue', async () => {
    const queue = new DynamicQueue<number>(2, 0);
    const stats = await queue.start(async () => {});
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(0);
  });
});
