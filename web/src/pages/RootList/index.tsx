import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Typography, Card, Tag, Space, Spin, Alert,
  Input, Row, Col, Statistic, Empty, Collapse, Badge,
  Select, Tooltip, Segmented,
} from 'antd';
import {
  ApartmentOutlined, FileOutlined, NodeIndexOutlined,
  SearchOutlined, ClockCircleOutlined, FilterOutlined,
  AppstoreOutlined, BarsOutlined, FunctionOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import type { RootItem, MetadataResponse } from '../../types';
import { fetchRoots, fetchMetadata } from '../../services/api';

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
    case 'name':
      return sorted.sort((a, b) => a.rootFunctionName.localeCompare(b.rootFunctionName));
    case 'depth':
      return sorted.sort((a, b) => b.depth - a.depth);
    case 'nodeCount':
      return sorted.sort((a, b) => b.nodeCount - a.nodeCount);
    case 'fileCount':
      return sorted.sort((a, b) => b.fileCount - a.fileCount);
    default:
      return sorted;
  }
}

/** 紧凑行 */
function CompactRow({ item, onClick }: { item: RootItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#252526')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
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

/** 卡片 */
function GridCard({ item, onClick }: { item: RootItem; onClick: () => void }) {
  return (
    <Card
      hoverable
      size="small"
      onClick={onClick}
      style={{ background: '#1f1f1f', borderColor: '#303030', height: '100%' }}
      styles={{ body: { padding: '16px' } }}
    >
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

export default function RootList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootItem[]>([]);
  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [search, setSearch] = useState('');
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    Promise.all([fetchRoots(), fetchMetadata()])
      .then(([rootsRes, metaRes]) => {
        setRoots(rootsRes.roots);
        setMeta(metaRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 提取所有 rawParam 用于筛选
  const allParams = useMemo(() => {
    const set = new Set(roots.map((r) => r.rawParam));
    return [...set].sort();
  }, [roots]);

  // 筛选 + 搜索
  const filtered = useMemo(() => {
    return roots.filter((r) => {
      // 参数筛选
      if (selectedParams.length > 0 && !selectedParams.includes(r.rawParam)) return false;
      // 搜索
      if (search) {
        const s = search.toLowerCase();
        return (
          r.rootFunctionName.toLowerCase().includes(s) ||
          r.rootPath.toLowerCase().includes(s) ||
          r.rawParam.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [roots, search, selectedParams]);

  // 按 rawParam 分组 + 排序
  const grouped = useMemo(() => {
    const map = new Map<string, RootItem[]>();
    for (const item of filtered) {
      const list = map.get(item.rawParam) || [];
      list.push(item);
      map.set(item.rawParam, list);
    }
    // 对每个分组内部排序
    for (const [key, items] of map) {
      map.set(key, sortItems(items, sortKey));
    }
    return map;
  }, [filtered, sortKey]);

  // 折叠面板的默认展开：当只有一个参数或总数不多时全展开
  const defaultActiveKeys = useMemo(() => {
    const keys = [...grouped.keys()];
    if (keys.length <= 3 || filtered.length <= 20) return keys;
    return keys.slice(0, 1); // 超过 3 个分组时只展开第一个
  }, [grouped, filtered]);

  const handleNavigate = (item: RootItem) => {
    navigate('/tree/' + encodeURIComponent(item.rawParam) + '?rootId=' + encodeURIComponent(item.rootId));
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px',
        borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>Tracking Lineage</Title>
        </div>
        {meta?.metadata && (
          <Space size="middle">
            <Text type="secondary">{meta.metadata.repoName}</Text>
            <Tag color="blue">{meta.metadata.commitId?.slice(0, 8)}</Tag>
            {meta.pathMapped && <Tag color="orange">路径已映射</Tag>}
          </Space>
        )}
      </Header>

      <Content style={{ padding: '24px 48px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {/* 统计栏 */}
        {meta?.metadata && (
          <Card size="small" style={{ marginBottom: 24, background: '#1f1f1f', borderColor: '#303030' }}>
            <Row gutter={24}>
              <Col><Statistic title="追踪参数" value={meta.metadata.rawParams.length} prefix={<SearchOutlined />} /></Col>
              <Col><Statistic title="调用树根节点" value={roots.length} prefix={<ApartmentOutlined />} /></Col>
              <Col><Statistic title="分析时间" value={new Date(meta.metadata.analyzedAt).toLocaleString('zh-CN')} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
            </Row>
          </Card>
        )}

        {/* 搜索 + 筛选 + 排序 工具栏 */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <Input
            placeholder="搜索函数名、文件路径或参数名..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ flex: 1, minWidth: 240 }}
          />
          <Select
            mode="multiple"
            placeholder={<><FilterOutlined /> 按字段筛选</>}
            value={selectedParams}
            onChange={setSelectedParams}
            allowClear
            maxTagCount="responsive"
            style={{ minWidth: 200 }}
            options={allParams.map((p) => {
              const count = roots.filter((r) => r.rawParam === p).length;
              return { label: `${p} (${count})`, value: p };
            })}
          />
          <Tooltip title="排序方式">
            <Select
              value={sortKey}
              onChange={setSortKey}
              style={{ width: 130 }}
              suffixIcon={<SortAscendingOutlined />}
              options={SORT_OPTIONS}
            />
          </Tooltip>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { value: 'grid', icon: <AppstoreOutlined /> },
              { value: 'compact', icon: <BarsOutlined /> },
            ]}
          />
        </div>

        {/* 列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : error ? (
          <Alert type="error" message="加载失败" description={error} showIcon />
        ) : filtered.length === 0 ? (
          <Empty description="未找到匹配的调用树" />
        ) : (
          <Collapse
            defaultActiveKey={defaultActiveKeys}
            ghost
            style={{ background: 'transparent' }}
            items={[...grouped.entries()].map(([rawParam, items]) => ({
              key: rawParam,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="processing" style={{ fontSize: 14, padding: '2px 12px', margin: 0 }}>{rawParam}</Tag>
                  <Badge
                    count={items.length}
                    style={{ backgroundColor: '#1677ff' }}
                    overflowCount={999}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>棵调用树</Text>
                </div>
              ),
              children: viewMode === 'grid' ? (
                <Row gutter={[16, 16]} style={{ padding: '8px 0' }}>
                  {items.map((item) => (
                    <Col xs={24} sm={12} lg={8} xl={6} key={item.rootId}>
                      <GridCard item={item} onClick={() => handleNavigate(item)} />
                    </Col>
                  ))}
                </Row>
              ) : (
                <div style={{
                  background: '#1a1a1a', borderRadius: 8,
                  border: '1px solid #303030', overflow: 'hidden',
                }}>
                  {items.map((item, idx) => (
                    <div key={item.rootId} style={{ borderTop: idx > 0 ? '1px solid #252526' : undefined }}>
                      <CompactRow item={item} onClick={() => handleNavigate(item)} />
                    </div>
                  ))}
                </div>
              ),
              style: {
                marginBottom: 16,
                background: '#1a1a1a',
                borderRadius: 8,
                border: '1px solid #303030',
              },
            }))}
          />
        )}
      </Content>
    </Layout>
  );
}
