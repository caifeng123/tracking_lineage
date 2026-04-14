import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Typography, Card, Input, Button, Space, Tag, Alert,
  Spin, Empty, Popconfirm, Tooltip, message, Row, Col,
  Statistic, Badge, Progress,
} from 'antd';
import {
  ApartmentOutlined, GithubOutlined, PlusOutlined,
  DeleteOutlined, ReloadOutlined, FolderOutlined,
  CheckCircleOutlined, LoadingOutlined, ClockCircleOutlined,
  LinkOutlined, CopyOutlined,
  SearchOutlined, TagOutlined, DatabaseOutlined,
  ThunderboltOutlined, RightOutlined,
} from '@ant-design/icons';
import {
  cloneRepo, deleteRepo, subscribeCloneSSE,
  type CloneResponse,
} from '../../services/repoApi';
import { fetchOverview } from '../../services/api';
import { fetchAnalyzeJobs } from '../../services/analyzeApi';
import type { RepoSummary } from '../../types';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

// ==================== Types ====================

interface ActiveJob {
  id: string;
  rawParams: string[];
  status: 'queued' | 'running';
  currentStage?: string;
  startTime: number;
  durationMs: number;
}

// ==================== Helpers ====================

function formatTime(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m${remSec}s`;
}

const STAGE_NAMES: Record<string, string> = {
  '1-projectAnalyze': '项目概览',
  '2-paramVariant': '参数变种',
  '3-paramLocate': '函数定位',
  '4-findCall': '依赖图构建',
  '5-treeAnalyze': '调用树分析',
};

/* ==================== Clone Progress ==================== */

function CloneProgress({
  cloneId, repoName, existed, onDone,
}: {
  cloneId: string; repoName: string; existed: boolean; onDone: (success: boolean) => void;
}) {
  const [status, setStatus] = useState<'cloning' | 'completed' | 'error'>('cloning');
  const [progressMsg, setProgressMsg] = useState(existed ? '正在更新仓库...' : '正在克隆仓库...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeCloneSSE(cloneId, {
      onProgress: (data) => setProgressMsg(data.message),
      onComplete: (data) => { setStatus('completed'); setProgressMsg(data.message); onDone(true); },
      onError: (data) => { setStatus('error'); setError(data.error); onDone(false); },
      onDisconnect: () => { if (status === 'cloning') { setStatus('error'); setError('连接断开'); onDone(false); } },
    });
    return () => unsub();
  }, [cloneId]);

  return (
    <Card size="small" style={{
      background: status === 'error' ? 'rgba(255,77,79,0.06)' : status === 'completed' ? 'rgba(82,196,26,0.06)' : 'rgba(22,119,255,0.06)',
      borderColor: status === 'error' ? 'rgba(255,77,79,0.3)' : status === 'completed' ? 'rgba(82,196,26,0.3)' : 'rgba(22,119,255,0.3)',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {status === 'cloning' && <LoadingOutlined spin style={{ color: '#1677ff', fontSize: 18 }} />}
        {status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />}
        {status === 'error' && <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />}
        <div style={{ flex: 1 }}>
          <Text strong style={{ color: '#e6e6e6' }}>{existed ? '更新' : '克隆'} {repoName}</Text>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {error || progressMsg}
            </Text>
          </div>
        </div>
        {status === 'completed' && <Tag color="success" style={{ margin: 0 }}>完成</Tag>}
        {status === 'error' && <Tag color="error" style={{ margin: 0 }}>失败</Tag>}
      </div>
    </Card>
  );
}

/* ==================== Analyzing Badge ==================== */

function AnalyzingBadge({ job, onClick }: { job: ActiveJob; onClick: (e: React.MouseEvent) => void }) {
  const [elapsed, setElapsed] = useState(Date.now() - job.startTime);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - job.startTime), 1000);
    return () => clearInterval(timer);
  }, [job.startTime]);

  const stageName = job.currentStage ? (STAGE_NAMES[job.currentStage] || job.currentStage) : null;

  return (
    <div
      onClick={onClick}
      style={{
        marginTop: 8,
        padding: '8px 12px',
        background: 'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(114,46,209,0.10) 100%)',
        borderRadius: 8,
        border: '1px solid rgba(22,119,255,0.25)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(22,119,255,0.5)';
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(22,119,255,0.18) 0%, rgba(114,46,209,0.15) 100%)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(22,119,255,0.25)';
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(114,46,209,0.10) 100%)';
      }}
    >
      <LoadingOutlined spin style={{ color: '#1677ff', fontSize: 16 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 12, color: '#1677ff' }}>
            {job.status === 'queued' ? '排队中' : '分析中'}
          </Text>
          {stageName && (
            <Tag color="processing" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
              {stageName}
            </Tag>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>
            {job.rawParams.slice(0, 2).join(', ')}{job.rawParams.length > 2 ? ` 等${job.rawParams.length}个` : ''}
          </Text>
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>{formatDuration(elapsed)}</Text>
      </div>
      <RightOutlined style={{ color: '#666', fontSize: 11 }} />
    </div>
  );
}

/* ==================== Repo Card ==================== */

function RepoCard({ repo, activeJob, onDelete, onClick }: {
  repo: RepoSummary;
  activeJob?: ActiveJob;
  onDelete: (name: string) => void;
  onClick: () => void;
}) {
  const navigate = useNavigate();
  const paramCount = repo.metadata?.rawParams?.length ?? 0;
  return (
    <Card size="small" hoverable onClick={onClick}
      style={{
        background: '#1f1f1f',
        borderColor: activeJob ? 'rgba(22,119,255,0.3)' : '#303030',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          {activeJob ? (
            <Badge dot status="processing" offset={[-2, 2]}>
              <FolderOutlined style={{ fontSize: 24, color: '#1677ff', marginTop: 2 }} />
            </Badge>
          ) : (
            <FolderOutlined style={{ fontSize: 24, color: '#1677ff', marginTop: 2 }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text strong style={{ fontSize: 16, color: '#e6e6e6' }}>{repo.name}</Text>
            {repo.gitUrl && <Tooltip title={repo.gitUrl}><LinkOutlined style={{ color: '#666', fontSize: 12 }} /></Tooltip>}
            {activeJob ? (
              <Tag color="processing" icon={<LoadingOutlined spin />} style={{ margin: 0, fontSize: 11 }}>分析中</Tag>
            ) : repo.hasResults ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>已分析</Tag>
            ) : (
              <Tag color="default" style={{ margin: 0, fontSize: 11 }}>未分析</Tag>
            )}
          </div>
          {repo.hasResults && repo.metadata && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
              {repo.metadata.commitId && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <TagOutlined style={{ marginRight: 4 }} />{repo.metadata.commitId.slice(0, 8)}
                </Text>
              )}
              {paramCount > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <DatabaseOutlined style={{ marginRight: 4 }} />{paramCount} 个参数
                </Text>
              )}
              {repo.metadata.analyzedAt && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {new Date(repo.metadata.analyzedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                </Text>
              )}
            </div>
          )}
          {!repo.hasResults && !activeJob && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />{formatTime(repo.lastModified)}
            </Text>
          )}
          {/* 分析中入口 */}
          {activeJob && (
            <AnalyzingBadge job={activeJob} onClick={(e) => {
              e.stopPropagation();
              navigate('/repo/' + encodeURIComponent(repo.name) + '?jobId=' + encodeURIComponent(activeJob.id));
            }} />
          )}
        </div>
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="复制路径">
            <Button type="text" size="small" icon={<CopyOutlined />}
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(repo.path); message.success('路径已复制'); }}
              style={{ color: '#999' }} />
          </Tooltip>
          <Popconfirm title="确认删除" description={`将删除仓库目录 "${repo.name}"，不可恢复。`}
            onConfirm={(e) => { e?.stopPropagation(); onDelete(repo.name); }}
            onCancel={(e) => e?.stopPropagation()}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Tooltip title="删除仓库">
              <Button type="text" size="small" icon={<DeleteOutlined />} danger style={{ opacity: 0.6 }}
                onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          </Popconfirm>
        </Space>
      </div>
    </Card>
  );
}

/* ==================== Main Page ==================== */

export default function RepoListPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTasks, setActiveTasks] = useState<Array<{ cloneId: string; repoName: string; existed: boolean }>>([]);

  // 活跃分析任务 map: repoName -> ActiveJob
  const [activeJobs, setActiveJobs] = useState<Map<string, ActiveJob>>(new Map());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRepos = useCallback(async () => {
    try { setLoading(true); setLoadError(null); const res = await fetchOverview(); setRepos(res.repos); return res.repos; }
    catch (err) { setLoadError(err instanceof Error ? err.message : '加载失败'); return []; }
    finally { setLoading(false); }
  }, []);

  // 查询所有仓库的活跃分析任务
  const pollActiveJobs = useCallback(async (repoList: RepoSummary[]) => {
    if (repoList.length === 0) return;

    const newMap = new Map<string, ActiveJob>();

    // 并行查询所有仓库的任务列表（最多 10 个并发）
    const batchSize = 10;
    for (let i = 0; i < repoList.length; i += batchSize) {
      const batch = repoList.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(repo => fetchAnalyzeJobs(repo.name))
      );
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const activeJob = result.value.jobs.find(
            j => j.status === 'running' || j.status === 'queued'
          );
          if (activeJob) {
            newMap.set(batch[idx].name, {
              id: activeJob.id,
              rawParams: activeJob.rawParams,
              status: activeJob.status as 'queued' | 'running',
              currentStage: activeJob.currentStage,
              startTime: activeJob.startTime,
              durationMs: activeJob.durationMs,
            });
          }
        }
      });
    }

    setActiveJobs(newMap);
  }, []);

  // 初始加载 + 启动轮询
  useEffect(() => {
    let repoListCache: RepoSummary[] = [];

    loadRepos().then(list => {
      repoListCache = list;
      pollActiveJobs(list);
    });

    // 每 8 秒轮询一次活跃任务
    pollTimerRef.current = setInterval(async () => {
      if (repoListCache.length > 0) {
        pollActiveJobs(repoListCache);
      }
    }, 8000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // repos 变化时更新 cache 给 polling 使用
  const reposCacheRef = useRef(repos);
  useEffect(() => {
    reposCacheRef.current = repos;
  }, [repos]);

  // 当有活跃任务时轮询更快（4秒），否则慢一些（10秒）
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const interval = activeJobs.size > 0 ? 4000 : 10000;
    pollTimerRef.current = setInterval(() => {
      if (reposCacheRef.current.length > 0) {
        pollActiveJobs(reposCacheRef.current);
      }
    }, interval);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeJobs.size > 0, pollActiveJobs]);

  const handleClone = async () => {
    const url = gitUrl.trim();
    if (!url) return;
    setCloning(true);
    try {
      const res: CloneResponse = await cloneRepo(url);
      setGitUrl('');
      setActiveTasks(prev => [{ cloneId: res.cloneId, repoName: res.repoName, existed: res.existed }, ...prev]);
      messageApi.info(res.message);
    } catch (err) { messageApi.error(err instanceof Error ? err.message : '克隆失败'); }
    finally { setCloning(false); }
  };

  const handleCloneDone = (success: boolean) => {
    if (success) {
      messageApi.success('仓库就绪');
      loadRepos().then(list => pollActiveJobs(list));
    }
  };

  const handleDelete = async (repoName: string) => {
    try { await deleteRepo(repoName); messageApi.success(`已删除: ${repoName}`); loadRepos(); }
    catch (err) { messageApi.error(err instanceof Error ? err.message : '删除失败'); }
  };

  const handleRefresh = () => {
    loadRepos().then(list => pollActiveJobs(list));
  };

  const filteredRepos = search ? repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : repos;
  const analyzedCount = repos.filter(r => r.hasResults).length;
  const analyzingCount = activeJobs.size;

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      {contextHolder}
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>Tracking Lineage</Title>
          {analyzingCount > 0 && (
            <Badge count={analyzingCount} size="small" style={{ backgroundColor: '#1677ff' }}>
              <Tag color="processing" icon={<LoadingOutlined spin />} style={{ marginLeft: 8, fontSize: 12 }}>
                分析中
              </Tag>
            </Badge>
          )}
        </div>
        <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} style={{ color: '#999' }}>刷新</Button>
      </Header>

      <Content style={{ padding: '24px 48px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        {/* 统计栏 */}
        {!loading && !loadError && repos.length > 0 && (
          <Card size="small" style={{ marginBottom: 24, background: '#1f1f1f', borderColor: '#303030' }}>
            <Row gutter={24}>
              <Col><Statistic title="仓库总数" value={repos.length} prefix={<FolderOutlined />} /></Col>
              <Col><Statistic title="已分析" value={analyzedCount} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col><Statistic title="未分析" value={repos.length - analyzedCount} prefix={<ClockCircleOutlined />} /></Col>
              {analyzingCount > 0 && (
                <Col>
                  <Statistic
                    title="分析中"
                    value={analyzingCount}
                    prefix={<ThunderboltOutlined />}
                    valueStyle={{ color: '#1677ff' }}
                  />
                </Col>
              )}
            </Row>
          </Card>
        )}

        {/* 添加仓库 */}
        <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 24 }}>
          <Title level={5} style={{ color: '#e6e6e6', marginBottom: 16 }}>
            <GithubOutlined style={{ color: '#1677ff', marginRight: 8 }} />添加分析项目
          </Title>
          <div style={{ display: 'flex', gap: 12 }}>
            <Input placeholder="输入 Git 仓库地址，如 https://code.byted.org/ecom/xxx"
              value={gitUrl} onChange={e => setGitUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !cloning && gitUrl.trim()) handleClone(); }}
              prefix={<LinkOutlined style={{ color: '#666' }} />} disabled={cloning} size="large" style={{ flex: 1 }} />
            <Button type="primary" size="large" icon={cloning ? <LoadingOutlined /> : <PlusOutlined />}
              onClick={handleClone} disabled={!gitUrl.trim() || cloning} loading={cloning}>
              {cloning ? '提交中' : '克隆'}
            </Button>
          </div>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>支持 HTTPS 和 SSH 格式。已存在的仓库将执行 git pull 更新。</Text>
          </div>
        </Card>

        {/* 活跃克隆任务 */}
        {activeTasks.map(task => (
          <CloneProgress key={task.cloneId} cloneId={task.cloneId} repoName={task.repoName} existed={task.existed} onDone={handleCloneDone} />
        ))}

        {/* 搜索 + 仓库列表 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ color: '#e6e6e6', margin: 0 }}><FolderOutlined style={{ marginRight: 8 }} />项目列表</Title>
          {repos.length > 3 && (
            <Input placeholder="搜索仓库..." prefix={<SearchOutlined />} value={search}
              onChange={e => setSearch(e.target.value)} allowClear style={{ width: 240 }} />
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : loadError ? (
          <Alert type="error" showIcon message="加载失败" description={loadError}
            action={<Button onClick={handleRefresh} size="small">重试</Button>} />
        ) : filteredRepos.length === 0 ? (
          <Empty description={<Text type="secondary">{search ? '未找到匹配的仓库' : '还没有项目，在上方输入 Git 地址添加一个吧'}</Text>} style={{ padding: 60 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredRepos.map(repo => (
              <RepoCard
                key={repo.name}
                repo={repo}
                activeJob={activeJobs.get(repo.name)}
                onDelete={handleDelete}
                onClick={() => navigate('/repo/' + encodeURIComponent(repo.name))}
              />
            ))}
          </div>
        )}
      </Content>
    </Layout>
  );
}
