import { useMemo } from 'react';
import { Tree, Tag, Typography } from 'antd';
import { FunctionOutlined, SyncOutlined } from '@ant-design/icons';
import type { TreeNode } from '../../types';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface CallTreeProps {
  root: TreeNode;
  onSelect: (node: TreeNode) => void;
  selectedFile: string;
}

function toDataNodes(node: TreeNode, nodeMap: Map<string, TreeNode>): DataNode {
  const key = node.id + '__' + Math.random().toString(36).slice(2, 8);
  nodeMap.set(key, node);

  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {node.isCycle ? (
        <SyncOutlined style={{ color: '#faad14', fontSize: 12 }} />
      ) : (
        <FunctionOutlined style={{ color: '#1677ff', fontSize: 12 }} />
      )}
      <Text style={{ maxWidth: 180, fontSize: 13 }} ellipsis={{ tooltip: node.functionName + ' (' + node.filePath + ':' + node.startLine + ')' }}>
        {node.functionName}
      </Text>
      <Text type="secondary" style={{ fontSize: 11 }}>:{node.startLine}</Text>
      {node.isCycle && (
        <Tag color="warning" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>循环</Tag>
      )}
    </span>
  );

  return {
    key,
    title,
    children: node.isCycle ? [] : node.children.map((child) => toDataNodes(child, nodeMap)),
  };
}

export default function CallTree({ root, onSelect }: CallTreeProps) {
  const nodeMap = useMemo(() => new Map<string, TreeNode>(), [root]);

  const treeData = useMemo(() => {
    nodeMap.clear();
    return [toDataNodes(root, nodeMap)];
  }, [root]);

  const defaultExpandedKeys = useMemo(() => {
    const keys: string[] = [];
    function collect(nodes: DataNode[], depth: number) {
      if (depth > 3) return;
      for (const n of nodes) {
        keys.push(n.key as string);
        if (n.children) collect(n.children, depth + 1);
      }
    }
    collect(treeData, 1);
    return keys;
  }, [treeData]);

  return (
    <Tree
      treeData={treeData}
      defaultExpandedKeys={defaultExpandedKeys}
      showLine={{ showLeafIcon: false }}
      blockNode
      style={{ background: 'transparent', fontSize: 13 }}
      onSelect={(_, info) => {
        const key = info.node.key as string;
        const node = nodeMap.get(key);
        if (node) onSelect(node);
      }}
    />
  );
}
