import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Typography, Spin, Alert, Button, Splitter, theme } from 'antd';
import { ArrowLeftOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useTreeDetail } from '../../hooks/useTreeDetail';
import CallTree from '../../components/CallTree';
import CodeViewer from '../../components/CodeViewer';
import FileTree from '../../components/FileTree';
import ReportPanel from '../../components/ReportPanel';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function TreeDetail() {
  const { rawParam = '', rootId = '' } = useParams();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const {
    loading, error, data, fileTree, fileContent,
    fileLoading, loadFile, selectedFile, highlightLine,
  } = useTreeDetail(rawParam, decodeURIComponent(rootId));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 48 }}>
        <Alert type="error" message="加载失败" description={error} showIcon />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/')}>返回列表</Button>
      </div>
    );
  }

  return (
    <Layout style={{ height: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', borderBottom: '1px solid #303030', height: 48, lineHeight: '48px',
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }} />
        <ApartmentOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
        <Title level={5} style={{ margin: 0, color: '#fff' }}>{data.root.functionName}</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>{rawParam} · {data.root.filePath}:{data.root.startLine}</Text>
      </Header>

      <Content style={{ height: 'calc(100vh - 48px)' }}>
        <Splitter style={{ height: '100%' }}>
          {/* 左侧: 调用树 + 文件树 */}
          <Splitter.Panel defaultSize="25%" min="15%" max="40%">
            <Splitter layout="vertical" style={{ height: '100%' }}>
              <Splitter.Panel defaultSize="60%">
                <div style={{ height: '100%', overflow: 'auto', background: '#1f1f1f', borderRight: '1px solid #303030', borderBottom: '1px solid #303030' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #303030' }}>
                    <Text strong style={{ fontSize: 13 }}>调用树</Text>
                  </div>
                  <div style={{ padding: '4px 0' }}>
                    <CallTree root={data.root} onSelect={(node) => loadFile(node.filePath, node.startLine)} selectedFile={selectedFile} />
                  </div>
                </div>
              </Splitter.Panel>
              <Splitter.Panel>
                <div style={{ height: '100%', overflow: 'auto', background: '#1f1f1f', borderRight: '1px solid #303030' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #303030' }}>
                    <Text strong style={{ fontSize: 13 }}>文件目录</Text>
                  </div>
                  <div style={{ padding: '4px 0' }}>
                    <FileTree tree={fileTree} onSelect={(filePath) => loadFile(filePath)} selectedFile={selectedFile} />
                  </div>
                </div>
              </Splitter.Panel>
            </Splitter>
          </Splitter.Panel>

          {/* 中间: 代码 */}
          <Splitter.Panel defaultSize="50%" min="30%">
            <div style={{ height: '100%', background: '#1e1e1e' }}>
              <CodeViewer fileContent={fileContent} loading={fileLoading} highlightLine={highlightLine} selectedFile={selectedFile} />
            </div>
          </Splitter.Panel>

          {/* 右侧: 报告 */}
          <Splitter.Panel defaultSize="25%" min="15%" max="40%">
            <div style={{ height: '100%', overflow: 'auto', background: '#1f1f1f', borderLeft: '1px solid #303030' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #303030' }}>
                <Text strong style={{ fontSize: 13 }}>分析报告</Text>
              </div>
              <div style={{ padding: 16 }}>
                <ReportPanel summary={data.summary} root={data.root} />
              </div>
            </div>
          </Splitter.Panel>
        </Splitter>
      </Content>
    </Layout>
  );
}
