import React, { useMemo } from 'react';
import { Typography, Descriptions, Tag, Empty, Divider, Tooltip } from 'antd';
import { ApartmentOutlined, FileOutlined, CodeOutlined, FileTextOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import type { TreeNode } from '../../types';

const { Text } = Typography;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportPanelProps {
  summary: string;
  root: TreeNode;
  onNavigate?: (filePath: string, line?: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Stats helpers                                                      */
/* ------------------------------------------------------------------ */

function collectStats(node: TreeNode) {
  const files = new Set<string>();
  let nodeCount = 0;
  let maxDepth = 0;
  let cycleCount = 0;

  function walk(n: TreeNode, depth: number) {
    nodeCount++;
    files.add(n.filePath);
    if (depth > maxDepth) maxDepth = depth;
    if (n.isCycle) { cycleCount++; return; }
    for (const child of n.children) walk(child, depth + 1);
  }

  walk(node, 1);
  return { fileCount: files.size, nodeCount, maxDepth, cycleCount };
}

function StatCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div style={{ background: '#252526', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: warn ? '#faad14' : '#1677ff', fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: warn ? '#faad14' : '#e6e6e6' }}>{value}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Path mapping: absolutePath → relativePath (filePath)               */
/* ------------------------------------------------------------------ */

/**
 * 遍历调用树，建立映射表 + 推断仓库根前缀
 *
 * TreeNode 中：
 *   - filePath：相对路径（后端 API 需要这个）
 *   - absolutePath：分析时的绝对路径（LLM 报告中的路径）
 */
function buildPathMaps(root: TreeNode) {
  const absToRel = new Map<string, string>();
  let repoPrefix = '';  // 推断出的仓库根目录前缀

  function walk(node: TreeNode) {
    if (node.absolutePath && node.filePath) {
      absToRel.set(node.absolutePath, node.filePath);

      // 推断仓库前缀：absolutePath 去掉尾部 filePath 就是前缀
      // 例如 absolutePath = /data00/home/user/repo/src/index.ts
      //      filePath     = src/index.ts
      //      prefix       = /data00/home/user/repo/
      if (!repoPrefix && node.absolutePath.endsWith(node.filePath)) {
        repoPrefix = node.absolutePath.slice(0, node.absolutePath.length - node.filePath.length);
      }
    }
    if (node.filePath) {
      absToRel.set(node.filePath, node.filePath);
    }
    if (!node.isCycle) {
      for (const child of node.children) walk(child);
    }
  }

  walk(root);
  return { absToRel, repoPrefix };
}

/**
 * 将绝对路径转为相对路径 — **始终返回一个可用的路径，永不返回 null**
 */
function resolveToRelative(
  absPath: string,
  absToRel: Map<string, string>,
  repoPrefix: string,
): string {
  // 1. 精确匹配
  const exact = absToRel.get(absPath);
  if (exact) return exact;

  // 2. 用已推断的仓库前缀截取
  if (repoPrefix && absPath.startsWith(repoPrefix)) {
    return absPath.slice(repoPrefix.length);
  }

  // 3. 尾缀匹配：遍历已知映射
  for (const [knownAbs, relPath] of absToRel) {
    if (knownAbs.endsWith(absPath) || absPath.endsWith(knownAbs)) {
      return relPath;
    }
    if (absPath.endsWith('/' + relPath)) {
      return relPath;
    }
  }

  // 4. 最终回退：如果路径以 / 开头，智能截取
  //    常见模式：去掉前面的 /data00/xxx/repos/repoName/ 部分
  //    策略：从已知相对路径的第一个目录段在绝对路径中找位置
  if (absPath.startsWith('/')) {
    // 尝试找到 src/ / pages/ / components/ / services/ / utils/ / lib/ 等常见目录
    const commonDirs = ['src/', 'pages/', 'components/', 'services/', 'lib/', 'app/', 'apps/', 'packages/'];
    for (const dir of commonDirs) {
      const idx = absPath.indexOf('/' + dir);
      if (idx !== -1) {
        return absPath.slice(idx + 1);
      }
    }
    // 最后方案：去掉开头的 /，直接作为路径传给后端（后端 safePath 会处理）
    return absPath.replace(/^\/+/, '');
  }

  // 不以 / 开头 → 可能本身就是相对路径
  return absPath;
}

/* ------------------------------------------------------------------ */
/*  Path regex & parsing                                               */
/* ------------------------------------------------------------------ */

const ABS_PATH_RE = /(\/(?:[\w.@-]+\/)+[\w.@-]+\.[\w]+):(\d+(?:,\d+)*)/g;

function basename(absPath: string): string {
  const parts = absPath.split('/');
  return parts[parts.length - 1] || absPath;
}

function parseFirstLine(lineStr?: string): number | undefined {
  if (!lineStr) return undefined;
  const first = lineStr.split(',')[0];
  return first ? parseInt(first, 10) : undefined;
}

interface PathSegment {
  type: 'text' | 'path';
  value: string;
  absPath?: string;
  line?: number;
  lineStr?: string;
}

function splitByPaths(text: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let lastIndex = 0;
  ABS_PATH_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ABS_PATH_RE.exec(text)) !== null) {
    const [fullMatch, absPath, lineStr] = match;
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'path', value: fullMatch, absPath, line: parseFirstLine(lineStr), lineStr });
    lastIndex = start + fullMatch.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/*  PathLink component — 始终可点击                                     */
/* ------------------------------------------------------------------ */

function PathLink({ absPath, line, lineStr, absToRel, repoPrefix, onNavigate }: {
  absPath: string;
  line?: number;
  lineStr?: string;
  absToRel: Map<string, string>;
  repoPrefix: string;
  onNavigate?: (filePath: string, line?: number) => void;
}) {
  const fileName = basename(absPath);
  const displayText = lineStr ? `${fileName}:${lineStr}` : fileName;
  const relPath = resolveToRelative(absPath, absToRel, repoPrefix);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate?.(relPath, line);
  };

  return (
    <Tooltip
      title={
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{relPath}{lineStr ? ':' + lineStr : ''}</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>点击跳转到代码</div>
        </div>
      }
      placement="top" overlayStyle={{ maxWidth: 500 }}
    >
      <span className="report-path-link" role="button" tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter') handleClick(e as unknown as React.MouseEvent); }}
      >
        <FileTextOutlined style={{ fontSize: 11, marginRight: 3 }} />
        {displayText}
      </span>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Text → PathLink renderer                                           */
/* ------------------------------------------------------------------ */

function renderTextWithPaths(
  text: string,
  absToRel: Map<string, string>,
  repoPrefix: string,
  onNavigate?: (filePath: string, line?: number) => void,
): React.ReactNode {
  const segments = splitByPaths(text);
  if (segments.length === 1 && segments[0].type === 'text') return text;

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ) : (
          <PathLink key={i} absPath={seg.absPath!} line={seg.line} lineStr={seg.lineStr}
            absToRel={absToRel} repoPrefix={repoPrefix} onNavigate={onNavigate} />
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom ReactMarkdown components                                    */
/* ------------------------------------------------------------------ */

function useMarkdownComponents(
  absToRel: Map<string, string>,
  repoPrefix: string,
  onNavigate?: (filePath: string, line?: number) => void,
): Components {
  return useMemo<Components>(() => {
    function processChildren(children: React.ReactNode): React.ReactNode {
      return React.Children.map(children, (child) => {
        if (typeof child === 'string') {
          return renderTextWithPaths(child, absToRel, repoPrefix, onNavigate);
        }
        return child;
      });
    }

    return {
      code({ children, className, ...props }) {
        if (className) {
          return <code className={className} {...props}>{children}</code>;
        }
        const raw = String(children).replace(/\n$/, '');
        const segments = splitByPaths(raw);
        const hasPath = segments.some((s) => s.type === 'path');
        if (!hasPath) return <code {...props}>{children}</code>;

        return (
          <code {...props} className="report-code-with-link">
            {segments.map((seg, i) =>
              seg.type === 'text' ? (
                <React.Fragment key={i}>{seg.value}</React.Fragment>
              ) : (
                <PathLink key={i} absPath={seg.absPath!} line={seg.line} lineStr={seg.lineStr}
                  absToRel={absToRel} repoPrefix={repoPrefix} onNavigate={onNavigate} />
              )
            )}
          </code>
        );
      },

      p({ children, ...props }) { return <p {...props}>{processChildren(children)}</p>; },
      li({ children, ...props }) { return <li {...props}>{processChildren(children)}</li>; },
      td({ children, ...props }) { return <td {...props}>{processChildren(children)}</td>; },
      h4({ children, ...props }) { return <h4 {...props}>{processChildren(children)}</h4>; },
      strong({ children, ...props }) { return <strong {...props}>{processChildren(children)}</strong>; },
    };
  }, [absToRel, repoPrefix, onNavigate]);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportPanel({ summary, root, onNavigate }: ReportPanelProps) {
  const stats = collectStats(root);
  const { absToRel, repoPrefix } = useMemo(() => buildPathMaps(root), [root]);
  const components = useMarkdownComponents(absToRel, repoPrefix, onNavigate);

  // 预处理 summary：
  // 1. 将字面量 \n 替换为真正的换行符
  // 2. 在非代码块、非表格区域，将单个换行转为双换行，确保 Markdown 正确分段
  const normalizedSummary = useMemo(() => {
    if (!summary) return summary;
    // Step 1: 字面量 \n → 真实换行
    let text = summary.replace(/\\n/g, '\n');

    // Step 2: 拆分代码块（保持不变）
    const parts = text.split(/(```[\s\S]*?```)/g);
    const processed = parts.map((part, i) => {
      // 奇数索引 = 代码块内容，保持不变
      if (i % 2 === 1) return part;

      // 非代码块区域：按行处理，识别表格行并保护
      const lines = part.split('\n');
      const result: string[] = [];
      for (let j = 0; j < lines.length; j++) {
        result.push(lines[j]);
        if (j < lines.length - 1) {
          const currLine = lines[j].trim();
          const nextLine = lines[j + 1].trim();
          // 判断是否在表格区域：当前行或下一行以 | 开头且以 | 结尾
          const currIsTable = currLine.startsWith('|') && currLine.endsWith('|');
          const nextIsTable = nextLine.startsWith('|') && nextLine.endsWith('|');
          // 也检查分隔线 |---|---|
          const currIsSep = /^\|[\s:|-]+\|$/.test(currLine);
          const nextIsSep = /^\|[\s:|-]+\|$/.test(nextLine);

          if ((currIsTable || currIsSep) && (nextIsTable || nextIsSep)) {
            // 表格行之间：保持单换行
            result.push('\n');
          } else if (currLine === '' || nextLine === '') {
            // 已有空行（双换行）：保持
            result.push('\n');
          } else {
            // 普通文本行：单换行→双换行
            result.push('\n\n');
          }
        }
      }
      return result.join('');
    });
    return processed.join('');
  }, [summary]);

  return (
    <div>
      <Descriptions size="small" column={1} labelStyle={{ color: '#888', fontSize: 12, width: 80 }} contentStyle={{ fontSize: 12 }}>
        <Descriptions.Item label="根函数">
          <Tag icon={<CodeOutlined />} color="blue" style={{ margin: 0 }}>{root.functionName}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="文件">
          <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{root.filePath}:{root.startLine}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="参数">
          <Tag color="green" style={{ margin: 0 }}>{root.param}</Tag>
        </Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '12px 0' }}>
        <StatCard icon={<ApartmentOutlined />} label="总节点" value={stats.nodeCount} />
        <StatCard icon={<FileOutlined />} label="涉及文件" value={stats.fileCount} />
        <StatCard icon={<ApartmentOutlined />} label="最大深度" value={stats.maxDepth} />
        <StatCard icon={<ApartmentOutlined />} label="循环引用" value={stats.cycleCount} warn={stats.cycleCount > 0} />
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <Text strong style={{ fontSize: 13 }}>AI 分析报告</Text>

      {normalizedSummary ? (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: '#ccc' }} className="report-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {normalizedSummary}
          </ReactMarkdown>
        </div>
      ) : (
        <Empty description="暂无分析报告" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 16 }} />
      )}

      <style>{`
        /* ===== 可点击路径链接 ===== */
        .report-path-link {
          display: inline-flex;
          align-items: center;
          color: #58a6ff;
          cursor: pointer;
          padding: 1px 6px;
          border-radius: 3px;
          background: rgba(88, 166, 255, 0.1);
          border: 1px solid rgba(88, 166, 255, 0.2);
          font-size: 12px;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace;
          line-height: 1.5;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .report-path-link:hover {
          background: rgba(88, 166, 255, 0.2);
          border-color: rgba(88, 166, 255, 0.4);
          color: #79c0ff;
          text-decoration: none;
        }
        .report-path-link:active {
          transform: scale(0.97);
        }

        /* code 标签内含路径链接 */
        .report-code-with-link {
          background: #2a2d35 !important;
          padding: 2px 4px !important;
          border-radius: 4px !important;
          font-size: 12px !important;
          border: 1px solid #383b44 !important;
          color: #ccc !important;
        }
        .report-code-with-link .report-path-link {
          margin: 0 1px;
          padding: 0 4px;
          border: none;
          background: rgba(88, 166, 255, 0.15);
        }

        /* ===== 标题层级颜色 ===== */
        .report-markdown h1 { color: #58a6ff; font-size: 18px; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #303030; }
        .report-markdown h2 { color: #79c0ff; font-size: 16px; margin: 16px 0 8px; }
        .report-markdown h3 { color: #a5d6ff; font-size: 14px; margin: 14px 0 6px; }
        .report-markdown h4 { color: #d2b48c; font-size: 13px; margin: 12px 0 6px; }

        /* ===== 正文 ===== */
        .report-markdown p { margin-bottom: 8px; color: #ccc; }
        .report-markdown strong { color: #e6e6e6; font-weight: 600; }
        .report-markdown em { color: #d4a5ff; font-style: italic; }

        /* ===== 行内代码 ===== */
        .report-markdown code:not(pre code):not(.report-code-with-link) {
          background: #2a2d35;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          color: #e06c75;
          border: 1px solid #383b44;
        }

        /* ===== 代码块 (rehype-highlight) ===== */
        .report-markdown pre {
          background: #1a1b26;
          padding: 14px;
          border-radius: 8px;
          overflow-x: auto;
          border: 1px solid #2a2d35;
          margin: 10px 0;
        }
        .report-markdown pre code {
          background: none !important;
          padding: 0 !important;
          border: none !important;
          color: #c9d1d9;
          font-size: 12px;
          line-height: 1.6;
        }

        /* rehype-highlight 语法高亮 (GitHub Dark) */
        .report-markdown .hljs-keyword { color: #ff7b72; }
        .report-markdown .hljs-string { color: #a5d6ff; }
        .report-markdown .hljs-number { color: #79c0ff; }
        .report-markdown .hljs-comment { color: #8b949e; font-style: italic; }
        .report-markdown .hljs-function { color: #d2a8ff; }
        .report-markdown .hljs-title { color: #d2a8ff; }
        .report-markdown .hljs-params { color: #c9d1d9; }
        .report-markdown .hljs-built_in { color: #ffa657; }
        .report-markdown .hljs-literal { color: #79c0ff; }
        .report-markdown .hljs-attr { color: #79c0ff; }
        .report-markdown .hljs-variable { color: #ffa657; }
        .report-markdown .hljs-type { color: #ff7b72; }
        .report-markdown .hljs-selector-class { color: #7ee787; }
        .report-markdown .hljs-selector-tag { color: #7ee787; }

        /* ===== 列表 ===== */
        .report-markdown ul, .report-markdown ol { padding-left: 20px; margin-bottom: 8px; }
        .report-markdown li { margin-bottom: 3px; }
        .report-markdown li::marker { color: #58a6ff; }

        /* ===== 引用块 ===== */
        .report-markdown blockquote {
          border-left: 3px solid #1f6feb;
          padding: 8px 14px;
          margin: 10px 0;
          background: rgba(31, 111, 235, 0.08);
          border-radius: 0 6px 6px 0;
          color: #aab2bd;
        }
        .report-markdown blockquote p { margin-bottom: 4px; }

        /* ===== 表格 (GFM) ===== */
        .report-markdown table {
          border-collapse: collapse;
          width: 100%;
          margin: 12px 0;
          font-size: 12px;
          border-radius: 6px;
          overflow: hidden;
        }
        .report-markdown thead th {
          background: #1f6feb;
          color: #ffffff;
          font-weight: 600;
          padding: 8px 12px;
          text-align: left;
          border: none;
          white-space: nowrap;
        }
        .report-markdown tbody td {
          padding: 7px 12px;
          border-bottom: 1px solid #2a2d35;
          color: #ccc;
        }
        .report-markdown tbody tr { background: #1a1b26; }
        .report-markdown tbody tr:nth-child(even) { background: #1e2030; }
        .report-markdown tbody tr:hover { background: rgba(31, 111, 235, 0.12); }

        .report-markdown td code, .report-markdown th code {
          background: rgba(110, 118, 129, 0.2);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
          color: #e06c75;
          border: none;
        }

        /* ===== 分隔线 ===== */
        .report-markdown hr { border: none; border-top: 1px solid #303030; margin: 16px 0; }

        /* ===== 链接 ===== */
        .report-markdown a { color: #58a6ff; text-decoration: none; }
        .report-markdown a:hover { text-decoration: underline; }

        /* ===== 删除线 (GFM) ===== */
        .report-markdown del { color: #8b949e; text-decoration: line-through; }
      `}</style>
    </div>
  );
}
