import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Layout, Typography, Card, Tag, Space, Spin, Alert,
  Input, Row, Col, Empty, Badge, Select, Tooltip,
  Segmented, Button, Breadcrumb,
} from 'antd';
import {
  ApartmentOutlined, FileOutlined, NodeIndexOutlined,
  SearchOutlined, AppstoreOutlined, BarsOutlined,
  FunctionOutlined, SortAscendingOutlined, ArrowLeftOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import type { RootItem } from '../../types';
import { fetchRoots } from '../../services/api';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type SortKey = 'name' | 'depth' | 'nodeCount' | 'fileCount';
type ViewMode = 'grid' | 'compact';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '函数名', value: 'name' },
  { label: '深度', value: 'depth' },
  { label: '节点数', value: 'nodeCount' },
  { label: '文件数', value: 'fileCount' },
];

function sortItems(items: RootItem[], key: SortKey): RootItem[] {
  const sorted = [...items];
  switch (key) {
    case 'name': return sorted.sort((a, b) => a.rootFunctionName.localeCompare(b.rootFunctionName));
    case 'depth': return sorted.sort((a, b) => b.depth - a.depth);
    case 'nodeCount': return sorted.sort((a, b) => b.nodeCount - a.nodeCount);
    case 'fileCount': return sorted.sort((a, b) => b.fileCount - a.fileCount);
    default: return sorted;
  }
}

/* ==================== CompactRow ==================== */

function CompactRow({ item, onClick }: { item: RootItem; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = '#252526')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <FunctionOutlined style={{ color: '#1677ff', fontSize: 14, flexShrink: 0 }} />
      <Text strong style={{ fontSize: 13, color: '#e6e6e6', minWidth: 160 }} ellipsis={{ tooltip: item.rootFunctionName }}>
        {item.rootFunctionName}
      </Text>
      <Text type="secondary" style={{ fontSize: 12, flex: 1 }} ellipsis={{ tooltip: item.rootPath }}>
        {item.rootPath}
      </Text>
      <Space size={4}>
        <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>深度 {item.depth}</Tag>
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{item.nodeCount} 节点</Tag>
        <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{item.fileCount} 文件</Tag>
      </Space>
    </div>
  );
}

/* ==================== GridCard ==================== */

function GridCard({ item, onClick }: { item: RootItem; onClick: () => void }) {
  return (
    <Card hoverable size="small" onClick={onClick}
      style={{ background: '#1f1f1f', borderColor: '#303030', height: '100%' }}
      styles={{ body: { padding: '16px' } }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 15, color: '#e6e6e6' }}>{item.rootFunctionName}</Text>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12, wordBreak: 'break-all' }}>
        {item.rootPath}
      </Text>
      <Space size="small" wrap>
        <Tag icon={<NodeIndexOutlined />} color="cyan">深度 {item.depth}</Tag>
        <Tag icon={<ApartmentOutlined />} color="blue">{item.nodeCount} 节点</Tag>
        <Tag icon={<FileOutlined />} color="purple">{item.fileCount} 文件</Tag>
      </Space>
    </Card>
  );
}

/* ==================== Main Page ==================== */

export default function ParamRootsPage() {
  const { repoName = '', rawParam = '' } = useParams();
  const decodedRepoName = decodeURIComponent(repoName);
  const decodedRawParam = decodeURIComponent(rawParam);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootItem[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    setLoading(true); setError(null);
    fetchRoots(decodedRepoName)
      .then(res => {
        const filtered = res.roots.filter((r: RootItem) => r.rawParam === decodedRawParam);
        setRoots(filtered);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [decodedRepoName, decodedRawParam]);

  const filteredTrees = useMemo(() => {
    let items = roots;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(r => r.rootFunctionName.toLowerCase().includes(s) || r.rootPath.toLowerCase().includes(s));
    }
    return sortItems(items, sortKey);
  }, [roots, search, sortKey]);

  const handleNavigate = (item: RootItem) => {
    navigate(`/repo/${encodeURIComponent(decodedRepoName)}/param/${encodeURIComponent(item.rawParam)}/tree?rootId=${encodeURIComponent(item.rootId)}`);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/repo/${encodeURIComponent(decodedRepoName)}`)} style={{ color: '#fff' }} />
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>{decodedRepoName}</Title>
          <Tag color="processing" style={{ fontSize: 14, padding: '2px 12px', margin: 0 }}>{decodedRawParam}</Tag>
        </div>
      </Header>

      <Content style={{ padding: '24px 48px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Breadcrumb style={{ marginBottom: 20 }} items={[
          { title: <a onClick={() => navigate('/')}><HomeOutlined /> 仓库列表</a> },
          { title: <a onClick={() => navigate(`/repo/${encodeURIComponent(decodedRepoName)}`)}>{decodedRepoName}</a> },
          { title: decodedRawParam },
        ]} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : error ? (
          <Alert type="error" message="加载失败" description={error} showIcon />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
              <Input placeholder="搜索函数名、文件路径..." prefix={<SearchOutlined />}
                value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ flex: 1, minWidth: 240 }} />
              <Tooltip title="排序方式">
                <Select value={sortKey} onChange={setSortKey} style={{ width: 130 }}
                  suffixIcon={<SortAscendingOutlined />} options={SORT_OPTIONS} />
              </Tooltip>
              <Segmented value={viewMode} onChange={v => setViewMode(v as ViewMode)} options={[
                { value: 'grid', icon: <AppstoreOutlined /> },
                { value: 'compact', icon: <BarsOutlined /> },
              ]} />
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={filteredTrees.length} style={{ backgroundColor: '#1677ff' }} overflowCount={9999} />
              <Text type="secondary" style={{ fontSize: 13 }}>棵调用树{search ? '（筛选结果）' : ''}</Text>
            </div>

            {filteredTrees.length === 0 ? (
              <Empty description="未找到匹配的调用树" />
            ) : viewMode === 'grid' ? (
              <Row gutter={[16, 16]}>
                {filteredTrees.map(item => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={item.rootId}>
                    <GridCard item={item} onClick={() => handleNavigate(item)} />
                  </Col>
                ))}
              </Row>
            ) : (
              <div style={{ background: '#1a1a1a', borderRadius: 8, border: '1px solid #303030', overflow: 'hidden' }}>
                {filteredTrees.map((item, idx) => (
                  <div key={item.rootId} style={{ borderTop: idx > 0 ? '1px solid #252526' : undefined }}>
                    <CompactRow item={item} onClick={() => handleNavigate(item)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Content>
    </Layout>
  );
}
