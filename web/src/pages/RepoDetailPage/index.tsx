import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Layout, Typography, Card, Input, Button, Space, Tag, Alert,
  Steps, Row, Col, Statistic, Divider, Spin, Result, Progress,
  Empty, Breadcrumb,
} from 'antd';
import {
  ApartmentOutlined, PlayCircleOutlined, PlusOutlined,
  CloseOutlined, ClockCircleOutlined,
  CheckCircleOutlined, LoadingOutlined, ExclamationCircleOutlined,
  EyeOutlined, ArrowLeftOutlined, ThunderboltOutlined,
  FolderOpenOutlined, ReloadOutlined, ForwardOutlined,
  TagOutlined, HomeOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import type { StageProgress, AnalyzeResult } from '../../types/analyze';
import type { ParamSummary } from '../../types';
import { fetchRepoParams } from '../../services/api';
import {
  createAnalyzeJob, subscribeAnalyzeSSE, fetchAnalyzeJob,
  fetchAnalyzeJobs,
} from '../../services/analyzeApi';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

/* ==================== Stage Config ==================== */

const STAGE_META: Record<string, { icon: string; color: string; description: string }> = {
  '项目概览分析':   { icon: '📋', color: '#1677ff', description: '使用 AI Agent 分析项目结构和技术栈' },
  '参数变种发现':   { icon: '🔍', color: '#722ed1', description: 'AI 识别参数在代码中的各种命名变种' },
  '全局函数定位':   { icon: '📍', color: '#13c2c2', description: '全局搜索 + AST 精确定位参数所在函数' },
  '依赖图构建':     { icon: '🔗', color: '#fa8c16', description: 'BFS 遍历函数调用关系，构建依赖图' },
  '调用树语义分析': { icon: '🌳', color: '#52c41a', description: 'AI 分析调用树语义，生成可读报告' },
};

const ALL_STAGES = [
  { id: '1-projectAnalyze', name: '项目概览分析', index: 1 },
  { id: '2-paramVariant',   name: '参数变种发现', index: 2 },
  { id: '3-paramLocate',    name: '全局函数定位', index: 3 },
  { id: '4-findCall',       name: '依赖图构建',   index: 4 },
  { id: '5-treeAnalyze',    name: '调用树语义分析', index: 5 },
];

const STAGE_STEPS = [
  { title: '项目概览', description: 'Stage 1' },
  { title: '变种发现', description: 'Stage 2' },
  { title: '函数定位', description: 'Stage 3' },
  { title: '依赖图',   description: 'Stage 4' },
  { title: '调用树',   description: 'Stage 5' },
];

const STAGE_NAMES: Record<string, string> = {
  '1-projectAnalyze': '项目概览',
  '2-paramVariant': '参数变种',
  '3-paramLocate': '函数定位',
  '4-findCall': '依赖图构建',
  '5-treeAnalyze': '调用树分析',
};

/* ==================== Helpers ==================== */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = (sec % 60).toFixed(0);
  return `${min}m ${remainSec}s`;
}

type StageStatus = 'wait' | 'running' | 'completed' | 'skipped';

function inferStageStatuses(progress: StageProgress[]): Map<number, StageStatus> {
  const statusMap = new Map<number, StageStatus>();
  for (const p of progress) {
    if (p.status === 'completed') statusMap.set(p.stageIndex, 'completed');
    else if (p.status === 'running' && statusMap.get(p.stageIndex) !== 'completed') statusMap.set(p.stageIndex, 'running');
  }
  let maxSeenIndex = 0;
  for (const [idx] of statusMap) maxSeenIndex = Math.max(maxSeenIndex, idx);
  for (let i = 1; i < maxSeenIndex; i++) { if (!statusMap.has(i)) statusMap.set(i, 'skipped'); }
  return statusMap;
}

function getStepStatus(stageIndex: number, m: Map<number, StageStatus>): 'wait' | 'process' | 'finish' | 'error' {
  const s = m.get(stageIndex);
  if (!s || s === 'wait') return 'wait';
  if (s === 'completed' || s === 'skipped') return 'finish';
  if (s === 'running') return 'process';
  return 'wait';
}

function getCurrentStepIndex(m: Map<number, StageStatus>): number {
  let maxActive = 0;
  for (const [idx, status] of m) { if (status === 'running') maxActive = Math.max(maxActive, idx); }
  return maxActive > 0 ? maxActive - 1 : 0;
}

function countCompletedStages(m: Map<number, StageStatus>): number {
  let c = 0;
  for (const [, status] of m) { if (status === 'completed' || status === 'skipped') c++; }
  return c;
}

/* ==================== Types for active jobs ==================== */

interface ActiveJobInfo {
  id: string;
  rawParams: string[];
  status: 'queued' | 'running';
  currentStage?: string;
  startTime: number;
  durationMs: number;
}

/* ==================== ParamTagInput ==================== */

function ParamTagInput({ params, onChange, disabled, inputValue, onInputChange }: {
  params: string[]; onChange: (p: string[]) => void; disabled: boolean;
  inputValue: string; onInputChange: (v: string) => void;
}) {
  const inputRef = useRef<any>(null);
  const handleAdd = () => { const t = inputValue.trim(); if (t && !params.includes(t)) onChange([...params, t]); onInputChange(''); inputRef.current?.focus(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
    if (e.key === 'Backspace' && !inputValue && params.length > 0) onChange(params.slice(0, -1));
  };
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      background: '#141414', border: '1px solid #303030', borderRadius: 8,
      padding: '8px 12px', minHeight: 48, opacity: disabled ? 0.6 : 1,
    }}>
      {params.map(p => (
        <Tag key={p} closable={!disabled} onClose={() => onChange(params.filter(x => x !== p))}
          color="processing" style={{ fontSize: 14, padding: '4px 10px', margin: 0 }}>{p}</Tag>
      ))}
      {!disabled && (
        <Input ref={inputRef}
          placeholder={params.length === 0 ? '输入参数名，按 Enter 添加...' : '继续添加...'}
          value={inputValue} onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown} onPressEnter={handleAdd}
          variant="borderless" style={{ flex: 1, minWidth: 180, color: '#e6e6e6', fontSize: 14 }} />
      )}
    </div>
  );
}

/* ==================== StageTimeline ==================== */

function StageTimeline({ progress, stageStatuses }: { progress: StageProgress[]; stageStatuses: Map<number, StageStatus> }) {
  const displayStages: Array<{
    stageIndex: number; stageName: string; status: string; durationMs?: number; message: string;
  }> = [];
  for (const [idx, status] of [...stageStatuses.entries()].sort((a, b) => a[0] - b[0])) {
    const stageDef = ALL_STAGES.find(s => s.index === idx);
    if (!stageDef) continue;
    if (status === 'skipped') {
      displayStages.push({ stageIndex: idx, stageName: stageDef.name, status: 'skipped', message: '已完成（缓存命中）' });
    } else {
      const events = progress.filter(p => p.stageIndex === idx);
      const last = events[events.length - 1];
      if (last) displayStages.push({ stageIndex: idx, stageName: last.stage, status: last.status, durationMs: last.durationMs, message: last.message });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {displayStages.map(stage => {
        const meta = STAGE_META[stage.stageName];
        const isRunning = stage.status === 'running';
        const isDone = stage.status === 'completed';
        const isSkipped = stage.status === 'skipped';
        const isError = stage.status === 'error';
        return (
          <div key={stage.stageIndex} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px', borderRadius: 8,
            background: isRunning ? 'rgba(22,119,255,0.08)' : isDone ? 'rgba(82,196,26,0.06)' : isSkipped ? 'rgba(250,140,22,0.06)' : isError ? 'rgba(255,77,79,0.06)' : '#1a1a1a',
            border: `1px solid ${isRunning ? 'rgba(22,119,255,0.3)' : isDone ? 'rgba(82,196,26,0.2)' : isSkipped ? 'rgba(250,140,22,0.2)' : isError ? 'rgba(255,77,79,0.2)' : '#252526'}`,
            transition: 'all 0.3s',
          }}>
            <div style={{ fontSize: 24, width: 36, textAlign: 'center' }}>
              {isRunning ? <LoadingOutlined spin style={{ color: '#1677ff' }} /> :
               isDone ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
               isSkipped ? <ForwardOutlined style={{ color: '#fa8c16' }} /> :
               isError ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> :
               meta?.icon ?? '⏳'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 14, color: '#e6e6e6' }}>Stage {stage.stageIndex}: {stage.stageName}</Text>
                {isRunning && <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>运行中</Tag>}
                {isSkipped && <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>快速跳过</Tag>}
                {isDone && stage.durationMs && <Tag color="success" style={{ margin: 0, fontSize: 11 }}>{formatDuration(stage.durationMs)}</Tag>}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isSkipped ? '已有缓存结果，跳过执行' : (meta?.description ?? stage.message)}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ==================== ParamCard ==================== */

function ParamCard({ param, onClick, analyzingJob, onClickJob }: {
  param: ParamSummary;
  onClick: () => void;
  analyzingJob?: ActiveJobInfo;
  onClickJob?: (jobId: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!analyzingJob) return;
    setElapsed(Date.now() - analyzingJob.startTime);
    const timer = setInterval(() => setElapsed(Date.now() - analyzingJob.startTime), 1000);
    return () => clearInterval(timer);
  }, [analyzingJob]);

  const stageName = analyzingJob?.currentStage
    ? (STAGE_NAMES[analyzingJob.currentStage] || analyzingJob.currentStage)
    : null;

  return (
    <Card hoverable onClick={onClick}
      style={{
        background: '#1f1f1f',
        borderColor: analyzingJob ? 'rgba(22,119,255,0.3)' : '#303030',
        height: '100%',
        transition: 'border-color 0.2s',
      }}
      styles={{ body: { padding: '20px 24px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TagOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <Text strong style={{ fontSize: 18, color: '#e6e6e6' }}>{param.rawParam}</Text>
        {analyzingJob && (
          <Tag color="processing" icon={<LoadingOutlined spin />} style={{ margin: 0, fontSize: 11 }}>
            分析中
          </Tag>
        )}
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>调用树</Text>
        <Text style={{ fontSize: 24, fontWeight: 600, color: '#1677ff' }}>{param.treeCount}</Text>
      </div>
      {analyzingJob && (
        <div
          onClick={(e) => { e.stopPropagation(); onClickJob?.(analyzingJob.id); }}
          style={{
            marginTop: 12, padding: '8px 12px',
            background: 'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(114,46,209,0.10) 100%)',
            borderRadius: 8, border: '1px solid rgba(22,119,255,0.25)',
            cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(22,119,255,0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(22,119,255,0.25)'; }}
        >
          <LoadingOutlined spin style={{ color: '#1677ff', fontSize: 14 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: 12, color: '#1677ff' }}>
                {analyzingJob.status === 'queued' ? '排队中' : '正在生成'}
              </Text>
              {stageName && (
                <Tag color="processing" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                  {stageName}
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />{formatDuration(elapsed)}
            </Text>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ==================== AnalyzingParamCard (no existing result yet) ==================== */

function AnalyzingParamCard({ paramName, job, onClickJob }: {
  paramName: string;
  job: ActiveJobInfo;
  onClickJob: (jobId: string) => void;
}) {
  const [elapsed, setElapsed] = useState(Date.now() - job.startTime);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - job.startTime), 1000);
    return () => clearInterval(timer);
  }, [job.startTime]);

  const stageName = job.currentStage ? (STAGE_NAMES[job.currentStage] || job.currentStage) : null;

  return (
    <Card
      hoverable
      onClick={() => onClickJob(job.id)}
      style={{
        background: '#1f1f1f',
        borderColor: 'rgba(22,119,255,0.3)',
        height: '100%',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <LoadingOutlined spin style={{ fontSize: 20, color: '#1677ff' }} />
        <Text strong style={{ fontSize: 18, color: '#e6e6e6' }}>{paramName}</Text>
        <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>
          {job.status === 'queued' ? '排队中' : '生成中'}
        </Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {stageName && (
          <Tag color="processing" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
            {stageName}
          </Tag>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {formatDuration(elapsed)}
        </Text>
      </div>
    </Card>
  );
}

/* ==================== Params List Section (reusable) ==================== */

function ParamsListSection({
  params, paramsLoading, paramsError, loadParams,
  pureAnalyzingEntries, analyzingParamJobMap,
  onParamClick, onClickActiveJob,
}: {
  params: ParamSummary[];
  paramsLoading: boolean;
  paramsError: string | null;
  loadParams: () => void;
  pureAnalyzingEntries: Array<{ paramName: string; job: ActiveJobInfo }>;
  analyzingParamJobMap: Map<string, ActiveJobInfo>;
  onParamClick: (rawParam: string) => void;
  onClickActiveJob: (jobId: string) => void;
}) {
  return (
    <>
      {/* 正在生成的字段 */}
      {pureAnalyzingEntries.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Title level={5} style={{ color: '#e6e6e6', margin: 0 }}>
              <LoadingOutlined spin style={{ marginRight: 8, color: '#1677ff' }} />正在生成的字段
              <Tag color="processing" style={{ marginLeft: 8, fontSize: 12 }}>{pureAnalyzingEntries.length}</Tag>
            </Title>
          </div>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {pureAnalyzingEntries.map((entry) => (
              <Col xs={24} sm={12} lg={8} key={`${entry.job.id}-${entry.paramName}`}>
                <AnalyzingParamCard
                  paramName={entry.paramName}
                  job={entry.job}
                  onClickJob={onClickActiveJob}
                />
              </Col>
            ))}
          </Row>
        </>
      )}

      {/* 已分析参数 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ color: '#e6e6e6', margin: 0 }}><DatabaseOutlined style={{ marginRight: 8 }} />已分析参数</Title>
        <Button type="text" icon={<ReloadOutlined />} onClick={loadParams} style={{ color: '#999' }}>刷新</Button>
      </div>

      {paramsLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : paramsError ? (
        <Alert type="error" showIcon message="加载失败" description={paramsError}
          action={<Button onClick={loadParams} size="small">重试</Button>} />
      ) : params.length === 0 ? (
        <Empty description={<Text type="secondary">暂无分析结果，点击上方「新分析」开始</Text>} style={{ padding: 60 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {params.map(param => (
            <Col xs={24} sm={12} lg={8} key={param.rawParam}>
              <ParamCard
                param={param}
                onClick={() => onParamClick(param.rawParam)}
                analyzingJob={analyzingParamJobMap.get(param.rawParam)}
                onClickJob={onClickActiveJob}
              />
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}

/* ==================== Main Page ==================== */

export default function RepoDetailPage() {
  const { repoName = '' } = useParams();
  const decoded = decodeURIComponent(repoName);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialJobId = searchParams.get('jobId');

  // Params list
  const [params, setParams] = useState<ParamSummary[]>([]);
  const [paramsLoading, setParamsLoading] = useState(true);
  const [paramsError, setParamsError] = useState<string | null>(null);

  // Analyze form
  const [showForm, setShowForm] = useState(false);
  const [rawParams, setRawParams] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progress, setProgress] = useState<StageProgress[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skippedParams, setSkippedParams] = useState<string[]>([]);
  // The rawParams of the current active job (for display in header)
  const [jobRawParams, setJobRawParams] = useState<string[]>([]);

  // Active jobs (for "generating" section)
  const [activeJobs, setActiveJobs] = useState<ActiveJobInfo[]>([]);
  const activeJobsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalDurationMs, setFinalDurationMs] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (unsubRef.current) unsubRef.current();
      if (activeJobsPollRef.current) clearInterval(activeJobsPollRef.current);
    };
  }, []);

  const loadParams = useCallback(async () => {
    try { setParamsLoading(true); setParamsError(null); const res = await fetchRepoParams(decoded); setParams(res.params); }
    catch (err) { setParamsError(err instanceof Error ? err.message : '加载失败'); }
    finally { setParamsLoading(false); }
  }, [decoded]);

  useEffect(() => { loadParams(); }, [loadParams]);

  // Poll active jobs for this repo
  const pollActiveJobs = useCallback(async () => {
    try {
      const res = await fetchAnalyzeJobs(decoded);
      const active = res.jobs
        .filter(j => j.status === 'running' || j.status === 'queued')
        .map(j => ({
          id: j.id,
          rawParams: j.rawParams,
          status: j.status as 'queued' | 'running',
          currentStage: j.currentStage,
          startTime: j.startTime,
          durationMs: j.durationMs,
        }));
      setActiveJobs(active);
    } catch {
      // ignore polling errors
    }
  }, [decoded]);

  useEffect(() => {
    pollActiveJobs();
    activeJobsPollRef.current = setInterval(pollActiveJobs, 5000);
    return () => {
      if (activeJobsPollRef.current) clearInterval(activeJobsPollRef.current);
    };
  }, [pollActiveJobs]);

  // 从 URL 中的 jobId 恢复分析任务进度
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!initialJobId || restoredRef.current) return;
    restoredRef.current = true;
    setSearchParams({}, { replace: true });
    setJobId(initialJobId);
    setJobStatus('running');
    setShowForm(false);
    fetchAnalyzeJob(decoded, initialJobId).then(job => {
      setProgress(job.progress);
      if (job.rawParams) { setRawParams(job.rawParams); setJobRawParams(job.rawParams); }
      if (job.startTime) startTimer(job.startTime);
      if (job.status === 'completed') {
        setJobStatus('completed');
        if (job.result) setResult(job.result);
        stopTimer(job.durationMs);
      } else if (job.status === 'error') {
        setJobStatus('error');
        if (job.error) setError(job.error);
        stopTimer(job.durationMs);
      } else {
        setJobStatus(job.status);
        subscribeToJob(initialJobId);
      }
    }).catch(() => {
      subscribeToJob(initialJobId);
    });
  }, [initialJobId]);

  const startTimer = useCallback((serverTime: number) => {
    setFinalDurationMs(null);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - serverTime), 200);
  }, []);

  const stopTimer = useCallback((finalMs?: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
    if (finalMs !== undefined) setFinalDurationMs(finalMs);
  }, []);

  const displayDuration = finalDurationMs ?? elapsedMs;

  const subscribeToJob = useCallback((id: string) => {
    if (unsubRef.current) unsubRef.current();
    const unsub = subscribeAnalyzeSSE(decoded, id, {
      onInit: (data) => {
        if (data.startTime) startTimer(data.startTime);
        setJobStatus(data.status);
        if (data.progress.length > 0) setProgress(data.progress);
        if (data.rawParams) setJobRawParams(data.rawParams);
      },
      onStage: (stage) => { setProgress(prev => [...prev, stage]); if (stage.status === 'running') setJobStatus('running'); },
      onStatus: (data) => setJobStatus(data.status),
      onComplete: (data) => { setJobStatus('completed'); setResult(data.result); stopTimer(data.durationMs); pollActiveJobs(); loadParams(); },
      onError: (data) => { setJobStatus('error'); setError(data.error); stopTimer(data.durationMs); pollActiveJobs(); },
      onDisconnect: () => {
        if (id) fetchAnalyzeJob(decoded, id).then(s => {
          setJobStatus(s.status); setProgress(s.progress);
          if (s.result) setResult(s.result); if (s.error) setError(s.error); stopTimer(s.durationMs);
        }).catch(() => {});
      },
    });
    unsubRef.current = unsub;
  }, [decoded, stopTimer, startTimer, pollActiveJobs, loadParams]);

  const pendingInput = inputValue.trim();
  const hasAnyParam = rawParams.length > 0 || pendingInput.length > 0;

  const handleSubmit = async () => {
    let finalParams = [...rawParams];
    if (pendingInput && !finalParams.includes(pendingInput)) { finalParams.push(pendingInput); setRawParams(finalParams); setInputValue(''); }
    if (finalParams.length === 0) return;
    setSubmitting(true); setError(null); setResult(null); setProgress([]); setJobStatus('queued'); setFinalDurationMs(null); setSkippedParams([]); setJobRawParams(finalParams);
    try {
      const res = await createAnalyzeJob(decoded, { rawParams: finalParams });
      if (res.alreadyDone) { setJobStatus('completed'); setSkippedParams(finalParams); setSubmitting(false); loadParams(); return; }
      setJobId(res.jobId); if (res.skippedParams) setSkippedParams(res.skippedParams);
      startTimer(Date.now()); if (res.jobId) subscribeToJob(res.jobId);
      pollActiveJobs();
    } catch (err) { setError(err instanceof Error ? err.message : '提交失败'); setJobStatus('error'); }
    finally { setSubmitting(false); }
  };

  const handleReset = () => {
    if (unsubRef.current) unsubRef.current(); stopTimer();
    setJobId(null); setJobStatus('idle'); setProgress([]); setResult(null); setError(null);
    setElapsedMs(0); setFinalDurationMs(null); setRawParams([]); setInputValue('');
    setShowForm(false); setSkippedParams([]); setJobRawParams([]); loadParams(); pollActiveJobs();
  };

  const isRunning = jobStatus === 'running' || jobStatus === 'queued';
  const isCompleted = jobStatus === 'completed' && result !== null;
  const isAllSkipped = jobStatus === 'completed' && result === null && skippedParams.length > 0;
  const isError = jobStatus === 'error';
  const isAnalyzing = isRunning || isCompleted || isAllSkipped || isError;

  const stageStatuses = inferStageStatuses(progress);
  const completedCount = countCompletedStages(stageStatuses);
  const overallPercent = Math.round((completedCount / 5) * 100);

  // Build analyzing param info (excluding current displayed job)
  const analyzingParamJobMap = new Map<string, ActiveJobInfo>();
  for (const aj of activeJobs) {
    if (jobId && aj.id === jobId) continue;
    for (const p of aj.rawParams) {
      if (!analyzingParamJobMap.has(p)) analyzingParamJobMap.set(p, aj);
    }
  }

  const existingParamNames = new Set(params.map(p => p.rawParam));
  const pureAnalyzingEntries: Array<{ paramName: string; job: ActiveJobInfo }> = [];
  for (const [paramName, aj] of analyzingParamJobMap) {
    if (!existingParamNames.has(paramName)) {
      pureAnalyzingEntries.push({ paramName, job: aj });
    }
  }

  const handleClickActiveJob = (activeJobId: string) => {
    navigate(`/repo/${encodeURIComponent(decoded)}?jobId=${encodeURIComponent(activeJobId)}`);
    window.location.reload();
  };

  const handleParamClick = (rawParam: string) => {
    navigate(`/repo/${encodeURIComponent(decoded)}/param/${encodeURIComponent(rawParam)}`);
  };

  // The params being analyzed in the current job (for display)
  const currentJobParamNames = jobRawParams.length > 0 ? jobRawParams : rawParams;

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* FIX #3: Back button goes to repo detail (reset), not repo list */}
          <Button type="text" icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (isAnalyzing) {
                // When analyzing, back = return to this repo's param list
                handleReset();
              } else {
                navigate('/');
              }
            }}
            style={{ color: '#fff' }}
          />
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>{decoded}</Title>
        </div>
        {isRunning && (
          <Space><LoadingOutlined spin style={{ color: '#1677ff' }} /><Text style={{ color: '#e6e6e6' }}>{formatDuration(displayDuration)}</Text></Space>
        )}
      </Header>

      <Content style={{ padding: '24px 48px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <Breadcrumb style={{ marginBottom: 20 }} items={[
          { title: <a onClick={() => navigate('/')}><HomeOutlined /> 仓库列表</a> },
          { title: isAnalyzing
            ? <a onClick={handleReset} style={{ cursor: 'pointer' }}>{decoded}</a>
            : decoded },
          ...(isAnalyzing ? [{ title: '分析进度' }] : []),
        ]} />

        {/* ===== 分析中/完成 ===== */}
        {isAnalyzing && (
          <>
            {/* FIX #1: Show which params are being analyzed */}
            {isRunning && currentJobParamNames.length > 0 && (
              <Card size="small" style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>正在分析的字段：</Text>
                  {currentJobParamNames.map(p => (
                    <Tag key={p} color="processing" style={{ fontSize: 13, padding: '2px 10px', margin: 0 }}>{p}</Tag>
                  ))}
                </div>
              </Card>
            )}

            {skippedParams.length > 0 && (
              <Alert type="info" showIcon message={`以下参数已有分析结果，已自动跳过: ${skippedParams.join(', ')}`} style={{ marginBottom: 16 }} />
            )}
            {isAllSkipped && (
              <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                <Result status="info" title="所有参数已有分析结果" subTitle="无需重复分析，可直接查看已有结果"
                  extra={<Button type="primary" onClick={handleReset}>返回参数列表</Button>} />
              </Card>
            )}
            {isRunning && (
              <>
                <Card size="small" style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Progress percent={overallPercent} strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
                      trailColor="#303030" style={{ flex: 1 }} format={() => `${completedCount}/5`} />
                    <Text style={{ color: '#e6e6e6', whiteSpace: 'nowrap' }}>{formatDuration(displayDuration)}</Text>
                  </div>
                </Card>
                <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                  <Steps current={getCurrentStepIndex(stageStatuses)} size="small"
                    items={STAGE_STEPS.map((step, idx) => ({ ...step, status: getStepStatus(idx + 1, stageStatuses) }))} />
                </Card>
                {(progress.length > 0 || stageStatuses.size > 0) && (
                  <Card title={<Text style={{ color: '#e6e6e6' }}><ClockCircleOutlined style={{ marginRight: 8 }} />阶段进度</Text>}
                    style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                    <StageTimeline progress={progress} stageStatuses={stageStatuses} />
                  </Card>
                )}
              </>
            )}
            {isCompleted && result && (
              <div style={{ marginBottom: 16 }}>
                <Card style={{ background: '#1f1f1f', borderColor: '#303030' }}>
                  <Result status="success" title="分析完成" subTitle={`总耗时 ${formatDuration(displayDuration)}`} />
                  <Row gutter={24} justify="center" style={{ marginTop: -24 }}>
                    <Col><Statistic title="变种对数" value={result.variantPairs} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#722ed1' }} /></Col>
                    <Col><Statistic title="函数定位" value={result.functionLocations} prefix={<FolderOpenOutlined />} valueStyle={{ color: '#13c2c2' }} /></Col>
                    <Col><Statistic title="调用树数" value={result.callTrees} prefix={<ApartmentOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
                  </Row>
                </Card>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Button type="primary" size="large" icon={<EyeOutlined />} onClick={handleReset}>查看分析结果</Button>
                </div>
              </div>
            )}
            {isError && error && (
              <Alert type="error" showIcon message="分析失败" description={error}
                action={<Button onClick={handleReset} size="small">重试</Button>} style={{ marginBottom: 16 }} />
            )}

            {/* FIX #2: Show existing params list below the analysis progress */}
            <Divider style={{ borderColor: '#303030', margin: '24px 0' }} />
            <ParamsListSection
              params={params}
              paramsLoading={paramsLoading}
              paramsError={paramsError}
              loadParams={loadParams}
              pureAnalyzingEntries={pureAnalyzingEntries}
              analyzingParamJobMap={analyzingParamJobMap}
              onParamClick={handleParamClick}
              onClickActiveJob={handleClickActiveJob}
            />
          </>
        )}

        {/* ===== 正常状态 ===== */}
        {!isAnalyzing && (
          <>
            <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 24 }}>
              {!showForm ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text type="secondary"><ThunderboltOutlined style={{ marginRight: 8 }} />添加新的追踪参数进行分析</Text>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>新分析</Button>
                </div>
              ) : (
                <>
                  <Title level={5} style={{ color: '#e6e6e6', marginBottom: 20 }}>
                    <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 8 }} />追踪参数
                  </Title>
                  <ParamTagInput params={rawParams} onChange={setRawParams} disabled={false}
                    inputValue={inputValue} onInputChange={setInputValue} />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>输入需要追踪的参数名，按 Enter 添加。已分析过的参数会自动跳过。</Text>
                  </div>
                  <Divider style={{ borderColor: '#303030', margin: '20px 0' }} />
                  <Space>
                    <Button type="primary" size="large" icon={<PlayCircleOutlined />}
                      onClick={handleSubmit} loading={submitting} disabled={!hasAnyParam} style={{ height: 48, fontSize: 16 }}>
                      开始分析
                    </Button>
                    <Button size="large" onClick={() => { setShowForm(false); setRawParams([]); setInputValue(''); }} icon={<CloseOutlined />}>取消</Button>
                  </Space>
                </>
              )}
            </Card>

            <ParamsListSection
              params={params}
              paramsLoading={paramsLoading}
              paramsError={paramsError}
              loadParams={loadParams}
              pureAnalyzingEntries={pureAnalyzingEntries}
              analyzingParamJobMap={analyzingParamJobMap}
              onParamClick={handleParamClick}
              onClickActiveJob={handleClickActiveJob}
            />
          </>
        )}
      </Content>
    </Layout>
  );
}
