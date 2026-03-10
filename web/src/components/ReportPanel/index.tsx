import React from 'react';
import { Typography, Descriptions, Tag, Empty, Divider } from 'antd';
import { ApartmentOutlined, FileOutlined, CodeOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { TreeNode } from '../../types';

const { Text } = Typography;

interface ReportPanelProps {
  summary: string;
  root: TreeNode;
}

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

export default function ReportPanel({ summary, root }: ReportPanelProps) {
  const stats = collectStats(root);

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
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      ) : (
        <Empty description="暂无分析报告" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 16 }} />
      )}

      <style>{"\
        .report-markdown h1,.report-markdown h2,.report-markdown h3{color:#e6e6e6;margin-top:12px;margin-bottom:8px}\
        .report-markdown h1{font-size:16px}.report-markdown h2{font-size:15px}.report-markdown h3{font-size:14px}\
        .report-markdown p{margin-bottom:8px}\
        .report-markdown code{background:#2a2a2a;padding:1px 5px;border-radius:3px;font-size:12px;color:#e06c75}\
        .report-markdown pre{background:#1e1e1e;padding:12px;border-radius:6px;overflow-x:auto}\
        .report-markdown pre code{background:none;padding:0;color:#ccc}\
        .report-markdown ul,.report-markdown ol{padding-left:20px;margin-bottom:8px}\
        .report-markdown li{margin-bottom:2px}\
        .report-markdown blockquote{border-left:3px solid #1677ff;padding-left:12px;margin:8px 0;color:#999}\
        .report-markdown table{border-collapse:collapse;width:100%;margin:8px 0}\
        .report-markdown th,.report-markdown td{border:1px solid #303030;padding:6px 10px;font-size:12px}\
        .report-markdown th{background:#252526}\
      "}</style>
    </div>
  );
}
