import React, { useMemo, useCallback } from 'react';
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
  /** 点击文件路径时的回调 — 与 CallTree 的 onSelect 行为一致 */
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
/*  Path → clickable link logic                                        */
/* ------------------------------------------------------------------ */

/**
 * 匹配绝对路径（以 / 开头，包含至少一个 / 分隔的路径段，以常见扩展名结尾）
 * 可选的 :行号 后缀（支持逗号分隔多行号如 :70,79）
 *
 * 示例命中:
 *   /data00/home/xxx/src/pages/channel/index.ts:22
 *   /src/services/getResources.ts:70,79
 *   /apps/gov_channel/src/utils.tsx
 */
const ABS_PATH_RE = /(\/(?:[\w.@-]+\/)+[\w.@-]+\.(?:ts|tsx|js|jsx|vue|mjs|cjs|css|scss|less|json|html|md))(?::(\d+(?:,\d+)*))?/g;

/** 从绝对路径中提取文件名 */
function basename(absPath: string): string {
  const parts = absPath.split('/');
  return parts[parts.length - 1] || absPath;
}

/** 解析行号字符串 "22" 或 "70,79" → 取第一个数字 */
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

/**
 * 将一段文本拆分成 text / path 交替的片段数组
 */
function splitByPaths(text: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let lastIndex = 0;

  // 每次调用需要重置 lastIndex（全局正则）
  ABS_PATH_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ABS_PATH_RE.exec(text)) !== null) {
    const [fullMatch, absPath, lineStr] = match;
    const start = match.index;

    // 前面的纯文本
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    segments.push({
      type: 'path',
      value: fullMatch,
      absPath,
      line: parseFirstLine(lineStr),
      lineStr,
    });

    lastIndex = start + fullMatch.length;
  }

  // 尾部纯文本
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/* ------------------------------------------------------------------ */
/*  PathLink — 可点击的文件名标签                                        */
/* ------------------------------------------------------------------ */

function PathLink({ absPath, line, lineStr, onNavigate }: {
  absPath: string;
  line?: number;
  lineStr?: string;
  onNavigate?: (filePath: string, line?: number) => void;
}) {
  const fileName = basename(absPath);
  const displayText = lineStr ? `${fileName}:${lineStr}` : fileName;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate?.(absPath, line);
  };

  return (
    <Tooltip
      title={absPath + (lineStr ? ':' + lineStr : '')}
      placement="top"
      overlayStyle={{ maxWidth: 500 }}
      overlayInnerStyle={{ fontSize: 11, wordBreak: 'break-all' }}
    >
      <span
        className="report-path-link"
        role="button"
        tabIndex={0}
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
/*  renderTextWithPaths — 将文本中路径替换为可点击组件                      */
/* ------------------------------------------------------------------ */

function renderTextWithPaths(
  text: string,
  onNavigate?: (filePath: string, line?: number) => void,
): React.ReactNode {
  const segments = splitByPaths(text);

  // 没有任何路径命中 → 返回原始文本
  if (segments.length === 1 && segments[0].type === 'text') {
    return text;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ) : (
          <PathLink
            key={i}
            absPath={seg.absPath!}
            line={seg.line}
            lineStr={seg.lineStr}
            onNavigate={onNavigate}
          />
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Build custom ReactMarkdown components                              */
/* ------------------------------------------------------------------ */

function useMarkdownComponents(onNavigate?: (filePath: string, line?: number) => void): Components {
  return useMemo<Components>(() => ({
    /**
     * 行内 code — 典型格式：`funcName(/abs/path/file.ts:22)`
     * 将其中的绝对路径替换为可点击短文件名
     */
    code({ children, className, ...props }) {
      // 如果是代码块内的 code（有 className 说明是 highlight），不处理
      if (className) {
        return <code className={className} {...props}>{children}</code>;
      }

      const raw = String(children).replace(/\n$/, '');
      const segments = splitByPaths(raw);
      const hasPath = segments.some((s) => s.type === 'path');

      if (!hasPath) {
        return <code {...props}>{children}</code>;
      }

      // 有路径 → 渲染为带可点击链接的 code 标签
      return (
        <code {...props} className="report-code-with-link">
          {segments.map((seg, i) =>
            seg.type === 'text' ? (
              <React.Fragment key={i}>{seg.value}</React.Fragment>
            ) : (
              <PathLink
                key={i}
                absPath={seg.absPath!}
                line={seg.line}
                lineStr={seg.lineStr}
                onNavigate={onNavigate}
              />
            )
          )}
        </code>
      );
    },

    /**
     * 普通文本段落 — 扫描其中的绝对路径
     */
    p({ children, ...props }) {
      return (
        <p {...props}>
          {React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return renderTextWithPaths(child, onNavigate);
            }
            return child;
          })}
        </p>
      );
    },

    /**
     * 列表项 — 扫描其中的绝对路径
     */
    li({ children, ...props }) {
      return (
        <li {...props}>
          {React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return renderTextWithPaths(child, onNavigate);
            }
            return child;
          })}
        </li>
      );
    },

    /**
     * 表格单元格 — 扫描其中的绝对路径
     */
    td({ children, ...props }) {
      return (
        <td {...props}>
          {React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return renderTextWithPaths(child, onNavigate);
            }
            return child;
          })}
        </td>
      );
    },

    /**
     * 标题 — 扫描其中的绝对路径（链路分析小节标题常含路径）
     */
    h4({ children, ...props }) {
      return (
        <h4 {...props}>
          {React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return renderTextWithPaths(child, onNavigate);
            }
            return child;
          })}
        </h4>
      );
    },

    /**
     * strong — 扫描其中的绝对路径
     */
    strong({ children, ...props }) {
      return (
        <strong {...props}>
          {React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return renderTextWithPaths(child, onNavigate);
            }
            return child;
          })}
        </strong>
      );
    },
  }), [onNavigate]);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportPanel({ summary, root, onNavigate }: ReportPanelProps) {
  const stats = collectStats(root);
  const components = useMarkdownComponents(onNavigate);

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

      {summary ? (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: '#ccc' }} className="report-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {summary}
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

        /* code 标签内含路径链接时的样式调整 */
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

        /* rehype-highlight 语法高亮色 (GitHub Dark 风格) */
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

        /* 表格内代码 */
        .report-markdown td code, .report-markdown th code {
          background: rgba(110, 118, 129, 0.2);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
          color: #e06c75;
          border: none;
        }

        /* ===== 分隔线 ===== */
        .report-markdown hr {
          border: none;
          border-top: 1px solid #303030;
          margin: 16px 0;
        }

        /* ===== 链接 ===== */
        .report-markdown a {
          color: #58a6ff;
          text-decoration: none;
        }
        .report-markdown a:hover {
          text-decoration: underline;
        }

        /* ===== 删除线 (GFM) ===== */
        .report-markdown del {
          color: #8b949e;
          text-decoration: line-through;
        }
      `}</style>
    </div>
  );
}
