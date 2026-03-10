import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Typography, Card, Tag, Space, Spin, Alert,
  Input, Row, Col, Statistic, Divider, Empty,
} from 'antd';
import {
  ApartmentOutlined, FileOutlined, NodeIndexOutlined,
  SearchOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { RootItem, MetadataResponse } from '../../types';
import { fetchRoots, fetchMetadata } from '../../services/api';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function RootList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootItem[]>([]);
  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([fetchRoots(), fetchMetadata()])
      .then(([rootsRes, metaRes]) => {
        setRoots(rootsRes.roots);
        setMeta(metaRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = roots.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.rootFunctionName.toLowerCase().includes(s) ||
      r.rootPath.toLowerCase().includes(s) ||
      r.rawParam.toLowerCase().includes(s)
    );
  });

  const grouped = new Map<string, RootItem[]>();
  for (const item of filtered) {
    const list = grouped.get(item.rawParam) || [];
    list.push(item);
    grouped.set(item.rawParam, list);
  }

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
        {meta?.metadata && (
          <Card size="small" style={{ marginBottom: 24, background: '#1f1f1f', borderColor: '#303030' }}>
            <Row gutter={24}>
              <Col><Statistic title="追踪参数" value={meta.metadata.rawParams.length} prefix={<SearchOutlined />} /></Col>
              <Col><Statistic title="调用树根节点" value={roots.length} prefix={<ApartmentOutlined />} /></Col>
              <Col><Statistic title="分析时间" value={new Date(meta.metadata.analyzedAt).toLocaleString('zh-CN')} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
            </Row>
          </Card>
        )}

        <Input
          placeholder="搜索函数名、文件路径或参数名..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="large"
          style={{ marginBottom: 24 }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : error ? (
          <Alert type="error" message="加载失败" description={error} showIcon />
        ) : filtered.length === 0 ? (
          <Empty description="未找到匹配的调用树" />
        ) : (
          [...grouped.entries()].map(([rawParam, items]) => (
            <div key={rawParam} style={{ marginBottom: 32 }}>
              <Divider orientation="left">
                <Tag color="processing" style={{ fontSize: 14, padding: '2px 12px' }}>{rawParam}</Tag>
                <Text type="secondary" style={{ marginLeft: 8 }}>{items.length} 棵调用树</Text>
              </Divider>
              <Row gutter={[16, 16]}>
                {items.map((item) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={item.rootId}>
                    <Card
                      hoverable
                      size="small"
                      onClick={() => navigate('/tree/' + encodeURIComponent(item.rawParam) + '?rootId=' + encodeURIComponent(item.rootId))}
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
                  </Col>
                ))}
              </Row>
            </div>
          ))
        )}
      </Content>
    </Layout>
  );
}
