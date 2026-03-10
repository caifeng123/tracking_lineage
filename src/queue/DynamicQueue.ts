export interface TaskHandlerResult<T> { dependentTasks?: T[]; }
export type TaskHandler<T> = (task: T) => Promise<TaskHandlerResult<T> | void>;
export interface QueueStats { completed: number; failed: number; total: number; }

export class DynamicQueue<T> {
  private readonly maxConcurrency: number;
  private readonly maxRetries: number;
  private taskQueue: T[] = [];
  private readonly seenTasks = new Set<string>();
  private readonly failedTasks = new Map<string, { task: T; error: Error }>();
  private running = 0;
  private completed = 0;
  private failed = 0;
  private isRunning = false;
  private handler: TaskHandler<T> | null = null;
  private generateId: (task: T) => string;
  private resolveCompletion: ((stats: QueueStats) => void) | null = null;

  constructor(maxConcurrency = 5, maxRetries = 3, generateId?: (task: T) => string) {
    this.maxConcurrency = maxConcurrency;
    this.maxRetries = maxRetries;
    this.generateId = generateId ?? ((task: T) => JSON.stringify(task));
  }

  setIdGenerator(fn: (task: T) => string): void { this.generateId = fn; }

  addTask(task: T): boolean {
    const id = this.generateId(task);
    if (this.seenTasks.has(id)) return false;
    this.seenTasks.add(id);
    this.taskQueue.push(task);
    if (this.isRunning && this.running < this.maxConcurrency) void this.processNext();
    return true;
  }

  addTasks(tasks: T[]): T[] { return tasks.filter((t) => this.addTask(t)); }

  start(handler: TaskHandler<T>): Promise<QueueStats> {
    if (this.isRunning) return Promise.resolve(this.getStats());
    this.handler = handler;
    this.isRunning = true;
    return new Promise<QueueStats>((resolve) => {
      this.resolveCompletion = resolve;
      const batch = Math.min(this.maxConcurrency, this.taskQueue.length);
      if (batch === 0) { this.isRunning = false; resolve(this.getStats()); return; }
      for (let i = 0; i < batch; i++) void this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.taskQueue.length === 0) return;
    const task = this.taskQueue.shift();
    if (!task) return;
    this.running++;
    try { await this.executeWithRetry(task); } catch { /* handled */ } finally {
      this.running--;
      if (this.taskQueue.length > 0) void this.processNext();
      this.checkCompletion();
    }
  }

  private async executeWithRetry(task: T): Promise<void> {
    const taskId = this.generateId(task);
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.handler!(task);
        if (result?.dependentTasks?.length) this.addTasks(result.dependentTasks);
        this.completed++;
        this.failedTasks.delete(taskId);
        return;
      } catch (error) {
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt + 1), 10000);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.failed++;
          this.failedTasks.set(taskId, { task, error: error instanceof Error ? error : new Error(String(error)) });
          throw error;
        }
      }
    }
  }

  private checkCompletion(): void {
    if (this.running === 0 && this.taskQueue.length === 0 && this.isRunning) {
      this.isRunning = false;
      if (this.resolveCompletion) { this.resolveCompletion(this.getStats()); this.resolveCompletion = null; }
    }
  }

  private getStats(): QueueStats { return { completed: this.completed, failed: this.failed, total: this.completed + this.failed }; }
}
