import { useMemo } from 'react';
import { Tree, Typography, Empty } from 'antd';
import { FolderOutlined, FileTextOutlined } from '@ant-design/icons';
import type { DirNode } from '../../types';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface FileTreeProps {
  tree: DirNode | null;
  onSelect: (filePath: string) => void;
  selectedFile: string;
}

function toDataNodes(node: DirNode): DataNode {
  const isDir = node.type === 'directory';

  const title = (
    <Text
      style={{
        fontSize: 12,
        color: node.involved ? '#1677ff' : undefined,
        fontWeight: node.involved ? 500 : undefined,
      }}
      ellipsis={{ tooltip: node.path || node.name }}
    >
      {node.name}
    </Text>
  );

  return {
    key: node.path || node.name,
    title,
    icon: isDir ? <FolderOutlined /> : <FileTextOutlined />,
    isLeaf: !isDir,
    children: isDir && node.children ? node.children.map(toDataNodes) : undefined,
    selectable: !isDir,
  };
}

export default function FileTree({ tree, onSelect, selectedFile }: FileTreeProps) {
  const treeData = useMemo(() => {
    if (!tree) return [];
    if (tree.children && tree.children.length > 0) return tree.children.map(toDataNodes);
    return [toDataNodes(tree)];
  }, [tree]);

  const defaultExpandedKeys = useMemo(() => {
    const keys: string[] = [];
    function collect(node: DirNode) {
      if (node.type === 'directory' && node.involved && node.path) keys.push(node.path);
      node.children?.forEach(collect);
    }
    if (tree) collect(tree);
    return keys;
  }, [tree]);

  if (!tree) return <Empty description="暂无文件树" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Tree
      treeData={treeData}
      defaultExpandedKeys={defaultExpandedKeys}
      selectedKeys={selectedFile ? [selectedFile] : []}
      showIcon
      blockNode
      style={{ background: 'transparent', fontSize: 12 }}
      onSelect={(keys) => { if (keys.length > 0) onSelect(keys[0] as string); }}
    />
  );
}
