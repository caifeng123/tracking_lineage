import { useMemo, useState, useCallback } from 'react';
import { Tree, Typography, Empty } from 'antd';
import { FolderOutlined, FolderOpenOutlined, FileTextOutlined, LoadingOutlined } from '@ant-design/icons';
import type { DirNode } from '../../types';
import type { DataNode, EventDataNode } from 'antd/es/tree';
import { fetchDirChildren } from '../../services/api';

const { Text } = Typography;

interface FileTreeProps {
  tree: DirNode | null;
  onSelect: (filePath: string) => void;
  selectedFile: string;
}

function toDataNodes(node: DirNode): DataNode {
  const isDir = node.type === 'directory';
  const isLazy = isDir && node.lazy;

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
    children: isDir && !isLazy && node.children
      ? node.children.map(toDataNodes)
      : undefined,
    selectable: !isDir,
  };
}

export default function FileTree({ tree, onSelect, selectedFile }: FileTreeProps) {
  const [lazyLoaded, setLazyLoaded] = useState<Record<string, DataNode[]>>({});

  const treeData = useMemo(() => {
    if (!tree) return [];
    const nodes = tree.children && tree.children.length > 0
      ? tree.children.map(toDataNodes)
      : [toDataNodes(tree)];

    // 将已懒加载的子项注入
    function injectLazy(list: DataNode[]): DataNode[] {
      return list.map((node) => {
        const key = node.key as string;
        if (lazyLoaded[key]) {
          return { ...node, children: injectLazy(lazyLoaded[key]), isLeaf: false };
        }
        if (node.children) {
          return { ...node, children: injectLazy(node.children) };
        }
        return node;
      });
    }

    return injectLazy(nodes);
  }, [tree, lazyLoaded]);

  const defaultExpandedKeys = useMemo(() => {
    const keys: string[] = [];
    function collect(node: DirNode) {
      if (node.type === 'directory' && node.involved && node.path) keys.push(node.path);
      node.children?.forEach(collect);
    }
    if (tree) collect(tree);
    return keys;
  }, [tree]);

  const onLoadData = useCallback(async (node: EventDataNode<DataNode>) => {
    const key = node.key as string;
    // 如果已加载过或已有 children 则跳过
    if (lazyLoaded[key] || (node.children && node.children.length > 0)) return;

    try {
      const res = await fetchDirChildren(key);
      const childNodes = res.children.map((child): DataNode => {
        const isDir = child.type === 'directory';
        const title = (
          <Text
            style={{ fontSize: 12 }}
            ellipsis={{ tooltip: child.path || child.name }}
          >
            {child.name}
          </Text>
        );
        return {
          key: child.path || child.name,
          title,
          icon: isDir ? <FolderOutlined /> : <FileTextOutlined />,
          isLeaf: !isDir,
          selectable: !isDir,
        };
      });
      setLazyLoaded((prev) => ({ ...prev, [key]: childNodes }));
    } catch {
      // 加载失败，设空数组避免重复请求
      setLazyLoaded((prev) => ({ ...prev, [key]: [] }));
    }
  }, [lazyLoaded]);

  if (!tree) return <Empty description="暂无文件树" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Tree
      treeData={treeData}
      defaultExpandedKeys={defaultExpandedKeys}
      selectedKeys={selectedFile ? [selectedFile] : []}
      loadData={onLoadData}
      showIcon
      blockNode
      style={{ background: 'transparent', fontSize: 12 }}
      onSelect={(keys) => { if (keys.length > 0) onSelect(keys[0] as string); }}
    />
  );
}
