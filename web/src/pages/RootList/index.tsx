import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Typography, Card, Tag, Space, Spin, Alert,
  Input, Row, Col, Statistic, Empty, Badge,
  Select, Tooltip, Segmented, Button,
} from 'antd';
import {
  ApartmentOutlined, FileOutlined, NodeIndexOutlined,
  SearchOutlined, ClockCircleOutlined,
  AppstoreOutlined, BarsOutlined, FunctionOutlined,
  SortAscendingOutlined, ArrowLeftOutlined,
  TagOutlined,
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

/* ==================== 参数选择卡片 ==================== */

interface ParamCardProps {
  param: string;
  count: number;
  maxDepth: number;
  totalNodes: number;
  onClick: () => void;
}

function ParamCard({ param, count, maxDepth, totalNodes, onClick }: ParamCardProps) {
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        background: '#1f1f1f', borderColor: '#303030', height: '100%',
        transition: 'border-color 0.2s',
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TagOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <Text strong style={{ fontSize: 18, color: '#e6e6e6' }}>{param}</Text>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>调用树</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, color: '#1677ff' }}>{count}</Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>最大深度</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, color: '#e6e6e6' }}>{maxDepth}</Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>总节点</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, color: '#e6e6e6' }}>{totalNodes}</Text>
        </div>
      </div>
    </Card>
  );
}

/* ==================== 调用树列表项 ==================== */

function CompactRow({ item, onClick }: { item: RootItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', cursor: 'pointer', borderRadius: 6,
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

/* ==================== 主页面 ==================== */

export default function RootList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootItem[]>([]);
  const [meta, setMeta] = useState<MetadataResponse | null>(null);

  // 两阶段状态：null = 参数选择页，string = 某参数下的调用树列表
  const [activeParam, setActiveParam] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    Promise.all([fetchRoots(), fetchMetadata()])
      .then(([rootsRes, metaRes]) => {
        setRoots(rootsRes.roots);
        setMeta(metaRes);
        // 如果只有一个参数，直接进入
        const params = new Set(rootsRes.roots.map((r: RootItem) => r.rawParam));
        if (params.size === 1) {
          setActiveParam([...params][0]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 提取所有参数及其统计
  const paramStats = useMemo(() => {
    const map = new Map<string, { count: number; maxDepth: number; totalNodes: number }>();
    for (const r of roots) {
      const existing = map.get(r.rawParam) || { count: 0, maxDepth: 0, totalNodes: 0 };
      existing.count++;
      existing.maxDepth = Math.max(existing.maxDepth, r.depth);
      existing.totalNodes += r.nodeCount;
      map.set(r.rawParam, existing);
    }
    return map;
  }, [roots]);

  // 当前参数下筛选 + 排序后的调用树
  const filteredTrees = useMemo(() => {
    if (!activeParam) return [];
    let items = roots.filter((r) => r.rawParam === activeParam);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((r) =>
        r.rootFunctionName.toLowerCase().includes(s) ||
        r.rootPath.toLowerCase().includes(s),
      );
    }
    return sortItems(items, sortKey);
  }, [roots, activeParam, search, sortKey]);

  const handleNavigate = (item: RootItem) => {
    navigate('/tree/' + encodeURIComponent(item.rawParam) + '?rootId=' + encodeURIComponent(item.rootId));
  };

  const handleBackToParams = () => {
    setActiveParam(null);
    setSearch('');
  };

  /* ==================== 渲染 ==================== */

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px',
        borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeParam && paramStats.size > 1 && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBackToParams} style={{ color: '#fff' }} />
          )}
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>Tracking Lineage</Title>
          {activeParam && (
            <Tag color="processing" style={{ fontSize: 14, padding: '2px 12px', margin: 0 }}>{activeParam}</Tag>
          )}
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
              <Col><Statistic title="追踪参数" value={paramStats.size} prefix={<SearchOutlined />} /></Col>
              <Col><Statistic title="调用树总数" value={roots.length} prefix={<ApartmentOutlined />} /></Col>
              <Col><Statistic title="分析时间" value={new Date(meta.metadata.analyzedAt).toLocaleString('zh-CN')} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
            </Row>
          </Card>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : error ? (
          <Alert type="error" message="加载失败" description={error} showIcon />
        ) : !activeParam ? (
          /* ===== 第一步：选择参数 ===== */
          <>
            <div style={{ marginBottom: 20 }}>
              <Text type="secondary" style={{ fontSize: 14 }}>选择要查看的追踪参数：</Text>
            </div>
            <Row gutter={[16, 16]}>
              {[...paramStats.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([param, stats]) => (
                <Col xs={24} sm={12} lg={8} key={param}>
                  <ParamCard
                    param={param}
                    count={stats.count}
                    maxDepth={stats.maxDepth}
                    totalNodes={stats.totalNodes}
                    onClick={() => setActiveParam(param)}
                  />
                </Col>
              ))}
            </Row>
          </>
        ) : (
          /* ===== 第二步：该参数下的调用树列表 ===== */
          <>
            {/* 工具栏 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
              <Input
                placeholder="搜索函数名、文件路径..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ flex: 1, minWidth: 240 }}
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

            {/* 计数提示 */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={filteredTrees.length} style={{ backgroundColor: '#1677ff' }} overflowCount={9999} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                棵调用树{search ? '（筛选结果）' : ''}
              </Text>
            </div>

            {/* 列表 */}
            {filteredTrees.length === 0 ? (
              <Empty description="未找到匹配的调用树" />
            ) : viewMode === 'grid' ? (
              <Row gutter={[16, 16]}>
                {filteredTrees.map((item) => (
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
