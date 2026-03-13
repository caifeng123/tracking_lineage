import { Hono } from 'hono';
import { resolve, join, basename } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { findProjectRoot } from '../../src/utils/findRoot.js';

// ==================== Types ====================

interface CloneRequest {
  gitUrl: string;
  /** 自定义目录名（可选，默认从 URL 推断） */
  dirName?: string;
}

interface RepoInfo {
  name: string;
  path: string;
  gitUrl?: string;
  lastModified: number;
}

interface CloneTask {
  status: 'cloning' | 'completed' | 'error';
  repoName: string;
  repoPath: string;
  error?: string;
  listeners: Set<(event: string, data: string) => void>;
}

// ==================== Helpers ====================

/** 从 git URL 提取仓库名 */
function extractRepoName(gitUrl: string): string {
  const cleaned = gitUrl.replace(/\.git\/?$/, '');
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

/** 获取 repos 根目录 */
function getReposDir(): string {
  const toolRoot = findProjectRoot(import.meta.url);
  const reposDir = resolve(toolRoot, 'repos');
  if (!existsSync(reposDir)) {
    mkdirSync(reposDir, { recursive: true });
  }
  return reposDir;
}

/** 验证 git URL 格式 */
function isValidGitUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url) || /^git@.+:.+/.test(url);
}

/** 检查目录是否为 git 仓库 */
function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** 获取 git remote URL */
function getGitRemoteUrl(dir: string): string | undefined {
  try {
    return execSync('git remote get-url origin', { cwd: dir, stdio: 'pipe' }).toString().trim();
  } catch {
    return undefined;
  }
}

// ==================== Task Store ====================

const cloneTasks = new Map<string, CloneTask>();

function generateCloneId(): string {
  return `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== Routes ====================

export function createRepoRoutes(): Hono {
  const app = new Hono();

  /**
   * GET / — 列出 repos 目录下所有已克隆的仓库
   */
  app.get('/', (c) => {
    const reposDir = getReposDir();
    const repos: RepoInfo[] = [];

    try {
      const entries = readdirSync(reposDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const repoPath = join(reposDir, entry.name);
        const stat = statSync(repoPath);

        repos.push({
          name: entry.name,
          path: repoPath,
          gitUrl: isGitRepo(repoPath) ? getGitRemoteUrl(repoPath) : undefined,
          lastModified: stat.mtimeMs,
        });
      }

      repos.sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      // repos 目录不存在或无法读取
    }

    return c.json({ repos, reposDir });
  });

  /**
   * POST / — 克隆一个 git 仓库到 repos 目录
   */
  app.post('/', async (c) => {
    let body: CloneRequest;
    try {
      body = await c.req.json<CloneRequest>();
    } catch {
      return c.json({ error: '请求体格式错误' }, 400);
    }

    const gitUrl = body.gitUrl?.trim();
    if (!gitUrl) {
      return c.json({ error: '请提供 git 仓库地址 (gitUrl)' }, 400);
    }

    if (!isValidGitUrl(gitUrl)) {
      return c.json({ error: `无效的 git 地址: ${gitUrl}` }, 400);
    }

    const reposDir = getReposDir();
    const repoName = body.dirName?.trim() || extractRepoName(gitUrl);
    const repoPath = resolve(reposDir, repoName);

    // 检查是否已存在
    if (existsSync(repoPath)) {
      if (isGitRepo(repoPath)) {
        // 已经克隆过 → 尝试 pull 更新
        const cloneId = generateCloneId();
        const task: CloneTask = {
          status: 'cloning',
          repoName,
          repoPath,
          listeners: new Set(),
        };
        cloneTasks.set(cloneId, task);

        setImmediate(() => {
          try {
            const output = execSync('git pull --ff-only 2>&1', {
              cwd: repoPath,
              timeout: 120_000,
              encoding: 'utf-8',
            });

            for (const listener of task.listeners) {
              listener('progress', JSON.stringify({ message: output.trim() }));
            }

            task.status = 'completed';
            for (const listener of task.listeners) {
              listener('complete', JSON.stringify({
                repoName,
                repoPath,
                message: '仓库已更新 (git pull)',
              }));
            }
          } catch (err) {
            task.status = 'error';
            task.error = err instanceof Error ? err.message : String(err);
            for (const listener of task.listeners) {
              listener('error', JSON.stringify({ error: task.error }));
            }
          }

          setTimeout(() => cloneTasks.delete(cloneId), 5 * 60_000);
        });

        return c.json({
          cloneId,
          repoName,
          repoPath,
          message: `仓库已存在，正在更新 (git pull)...`,
          existed: true,
        }, 200);
      }

      return c.json({
        error: `目录已存在但不是 git 仓库: ${repoName}`,
      }, 409);
    }

    // 开始克隆
    const cloneId = generateCloneId();
    const task: CloneTask = {
      status: 'cloning',
      repoName,
      repoPath,
      listeners: new Set(),
    };
    cloneTasks.set(cloneId, task);

    setImmediate(() => {
      const proc = spawn('git', ['clone', '--progress', gitUrl, repoPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let lastOutput = '';

      const handleData = (data: Buffer) => {
        const text = data.toString();
        lastOutput = text.trim();
        for (const listener of task.listeners) {
          listener('progress', JSON.stringify({ message: lastOutput }));
        }
      };

      proc.stdout?.on('data', handleData);
      proc.stderr?.on('data', handleData);

      proc.on('close', (code) => {
        if (code === 0) {
          task.status = 'completed';
          for (const listener of task.listeners) {
            listener('complete', JSON.stringify({
              repoName,
              repoPath,
              message: '克隆完成',
            }));
          }
        } else {
          task.status = 'error';
          task.error = `git clone 退出码: ${code}。${lastOutput}`;
          try { rmSync(repoPath, { recursive: true, force: true }); } catch {}
          for (const listener of task.listeners) {
            listener('error', JSON.stringify({ error: task.error }));
          }
        }

        setTimeout(() => cloneTasks.delete(cloneId), 5 * 60_000);
      });

      proc.on('error', (err) => {
        task.status = 'error';
        task.error = err.message;
        try { rmSync(repoPath, { recursive: true, force: true }); } catch {}
        for (const listener of task.listeners) {
          listener('error', JSON.stringify({ error: task.error }));
        }
      });
    });

    return c.json({
      cloneId,
      repoName,
      repoPath,
      message: `开始克隆 ${gitUrl}...`,
      existed: false,
    }, 201);
  });

  /**
   * GET /:cloneId/stream — SSE 订阅克隆进度
   */
  app.get('/:cloneId/stream', async (c) => {
    const cloneId = c.req.param('cloneId');
    const task = cloneTasks.get(cloneId);
    if (!task) return c.json({ error: '克隆任务不存在' }, 404);

    const { streamSSE } = await import('hono/streaming');
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'init',
        data: JSON.stringify({
          status: task.status,
          repoName: task.repoName,
          repoPath: task.repoPath,
        }),
      });

      if (task.status === 'completed') {
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            repoName: task.repoName,
            repoPath: task.repoPath,
            message: '克隆完成',
          }),
        });
        return;
      }
      if (task.status === 'error') {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: task.error }),
        });
        return;
      }

      const listener = async (event: string, data: string) => {
        try {
          await stream.writeSSE({ event, data });
        } catch {}
      };

      task.listeners.add(listener);

      try {
        while (task.status === 'cloning') {
          await stream.writeSSE({ event: 'heartbeat', data: '{}' });
          await stream.sleep(2000);
        }
      } catch {
        // 连接断开
      }

      task.listeners.delete(listener);
    });
  });

  /**
   * DELETE /:repoName — 删除一个已克隆的仓库
   */
  app.delete('/:repoName', (c) => {
    const repoName = c.req.param('repoName');
    const reposDir = getReposDir();
    const repoPath = resolve(reposDir, repoName);

    if (!repoPath.startsWith(reposDir)) {
      return c.json({ error: '非法路径' }, 400);
    }

    if (!existsSync(repoPath)) {
      return c.json({ error: `仓库不存在: ${repoName}` }, 404);
    }

    try {
      rmSync(repoPath, { recursive: true, force: true });
      return c.json({ message: `已删除: ${repoName}` });
    } catch (err) {
      return c.json({
        error: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  });

  return app;
}
