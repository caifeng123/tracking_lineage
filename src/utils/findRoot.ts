import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * 从当前文件位置向上查找 package.json，返回项目根目录。
 * 无论 tsc 编译产物嵌套几层（dist/src/…）都能正确定位。
 */
export function findProjectRoot(startUrl?: string): string {
  let dir = startUrl
    ? dirname(fileURLToPath(startUrl))
    : dirname(fileURLToPath(import.meta.url));

  while (dir !== dirname(dir)) {                    // 不超过文件系统根
    if (existsSync(resolve(dir, 'package.json'))) {
      // 确保是本项目的 package.json，不是某个父目录的
      // dist/ 下不会有 package.json，所以找到的一定是项目根
      return dir;
    }
    dir = dirname(dir);
  }
  // fallback: 回退到 ../.. (不应该走到这里)
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}
