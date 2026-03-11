import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Typography, Card, Input, Button, Space, Tag, Alert,
  Steps, Row, Col, Statistic, Divider, Tooltip, List, Spin,
  Result, Progress,
} from 'antd';
import {
  ApartmentOutlined, PlayCircleOutlined, PlusOutlined,
  CloseOutlined, DeleteOutlined, ClockCircleOutlined,
  CheckCircleOutlined, LoadingOutlined, ExclamationCircleOutlined,
  EyeOutlined, ArrowLeftOutlined, ThunderboltOutlined,
  FolderOpenOutlined, ReloadOutlined, ForwardOutlined,
} from '@ant-design/icons';
import type { StageProgress, AnalyzeResult, AnalyzeJobStatus } from '../../types/analyze';
import {
  createAnalyzeJob,
  subscribeAnalyzeSSE,
  fetchAnalyzeJobs,
  fetchAnalyzeJob,
} from '../../services/analyzeApi';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// ==================== Stage Configuration ====================

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
  { title: '依赖图', description: 'Stage 4' },
  { title: '调用树', description: 'Stage 5' },
];

// ==================== Helper Functions ====================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = (sec % 60).toFixed(0);
  return `${min}m ${remainSec}s`;
}

/**
 * 从 progress 数组中推断每个 Stage 的最终状态
 * 修复 Bug #2 #3: 当 Stage 执行极快（< 轮询间隔）导致 progress 中缺少该 Stage 的事件时，
 * 如果后续 Stage 已有事件，说明前面的 Stage 一定已完成 → 补齐为 completed/skipped
 */
function inferStageStatuses(progress: StageProgress[]): Map<number, 'wait' | 'running' | 'completed' | 'skipped'> {
  const statusMap = new Map<number, 'wait' | 'running' | 'completed' | 'skipped'>();

  // 先从实际 progress 事件中获取状态（取每个 stageIndex 的最后一条）
  for (const p of progress) {
    if (p.status === 'completed') {
      statusMap.set(p.stageIndex, 'completed');
    } else if (p.status === 'running' && statusMap.get(p.stageIndex) !== 'completed') {
      statusMap.set(p.stageIndex, 'running');
    }
  }

  // 找到最大的有事件的 stageIndex
  let maxSeenIndex = 0;
  for (const [idx] of statusMap) {
    maxSeenIndex = Math.max(maxSeenIndex, idx);
  }

  // 回填：如果 stageIndex < maxSeenIndex 但没有记录，说明执行太快被跳过了
  // 这些 Stage 一定已经执行完毕（Pipeline 是顺序执行的）
  for (let i = 1; i < maxSeenIndex; i++) {
    if (!statusMap.has(i)) {
      statusMap.set(i, 'skipped'); // 执行太快，视为已完成（标记 skipped 方便 UI 区分）
    }
  }

  return statusMap;
}

function getStepStatus(
  stageIndex: number,
  stageStatuses: Map<number, 'wait' | 'running' | 'completed' | 'skipped'>,
): 'wait' | 'process' | 'finish' | 'error' {
  const s = stageStatuses.get(stageIndex);
  if (!s || s === 'wait') return 'wait';
  if (s === 'completed' || s === 'skipped') return 'finish';
  if (s === 'running') return 'process';
  return 'wait';
}

function getCurrentStepIndex(stageStatuses: Map<number, 'wait' | 'running' | 'completed' | 'skipped'>): number {
  let maxActive = 0;
  for (const [idx, status] of stageStatuses) {
    if (status === 'running') {
      maxActive = Math.max(maxActive, idx);
    }
  }
  return maxActive > 0 ? maxActive - 1 : 0; // Steps 组件是 0-based
}

function countCompletedStages(stageStatuses: Map<number, 'wait' | 'running' | 'completed' | 'skipped'>): number {
  let count = 0;
  for (const [, status] of stageStatuses) {
    if (status === 'completed' || status === 'skipped') count++;
  }
  return count;
}

// ==================== Sub-Components ====================

/** 参数输入标签 — inputValue 提升到父组件 */
function ParamTagInput({
  params,
  onChange,
  disabled,
  inputValue,
  onInputChange,
}: {
  params: string[];
  onChange: (params: string[]) => void;
  disabled: boolean;
  inputValue: string;
  onInputChange: (val: string) => void;
}) {
  const inputRef = useRef<any>(null);

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !params.includes(trimmed)) {
      onChange([...params, trimmed]);
    }
    onInputChange('');
    inputRef.current?.focus();
  };

  const handleRemove = (param: string) => {
    onChange(params.filter(p => p !== param));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Backspace' && !inputValue && params.length > 0) {
      onChange(params.slice(0, -1));
    }
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      background: '#141414', border: '1px solid #303030', borderRadius: 8,
      padding: '8px 12px', minHeight: 48,
      opacity: disabled ? 0.6 : 1,
    }}>
      {params.map(p => (
        <Tag
          key={p}
          closable={!disabled}
          onClose={() => handleRemove(p)}
          color="processing"
          style={{ fontSize: 14, padding: '4px 10px', margin: 0 }}
        >
          {p}
        </Tag>
      ))}
      {!disabled && (
        <Input
          ref={inputRef}
          placeholder={params.length === 0 ? '输入参数名，按 Enter 添加...' : '继续添加...'}
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPressEnter={handleAdd}
          variant="borderless"
          style={{ flex: 1, minWidth: 180, color: '#e6e6e6', fontSize: 14 }}
        />
      )}
    </div>
  );
}

/** 阶段进度时间线 — 修复 Bug #3: 展示被跳过的 Stage */
function StageTimeline({ progress, stageStatuses }: { progress: StageProgress[]; stageStatuses: Map<number, string> }) {
  // 收集所有需要展示的 stage（包含推断出的 skipped stage）
  const displayStages: Array<{
    stageIndex: number;
    stageName: string;
    status: string;
    durationMs?: number;
    message: string;
  }> = [];

  // 从 stageStatuses 中生成完整列表
  const seenIndexes = new Set<number>();
  for (const p of progress) {
    seenIndexes.add(p.stageIndex);
  }

  for (const [idx, status] of [...stageStatuses.entries()].sort((a, b) => a[0] - b[0])) {
    const stageDef = ALL_STAGES.find(s => s.index === idx);
    if (!stageDef) continue;

    if (status === 'skipped') {
      // 被跳过的 stage — 用推断信息展示
      displayStages.push({
        stageIndex: idx,
        stageName: stageDef.name,
        status: 'skipped',
        message: `${stageDef.name} 已完成（缓存命中，快速跳过）`,
      });
    } else {
      // 从 progress 中取最后一条该 stageIndex 的事件
      const events = progress.filter(p => p.stageIndex === idx);
      const lastEvent = events[events.length - 1];
      if (lastEvent) {
        displayStages.push({
          stageIndex: idx,
          stageName: lastEvent.stage,
          status: lastEvent.status,
          durationMs: lastEvent.durationMs,
          message: lastEvent.message,
        });
      }
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
          <div
            key={stage.stageIndex}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '12px 16px', borderRadius: 8,
              background: isRunning ? 'rgba(22, 119, 255, 0.08)' :
                          isDone ? 'rgba(82, 196, 26, 0.06)' :
                          isSkipped ? 'rgba(250, 140, 22, 0.06)' :
                          isError ? 'rgba(255, 77, 79, 0.06)' : '#1a1a1a',
              border: `1px solid ${
                isRunning ? 'rgba(22, 119, 255, 0.3)' :
                isDone ? 'rgba(82, 196, 26, 0.2)' :
                isSkipped ? 'rgba(250, 140, 22, 0.2)' :
                isError ? 'rgba(255, 77, 79, 0.2)' : '#252526'
              }`,
              transition: 'all 0.3s',
            }}
          >
            <div style={{ fontSize: 24, width: 36, textAlign: 'center' }}>
              {isRunning ? <LoadingOutlined spin style={{ color: '#1677ff' }} /> :
               isDone ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
               isSkipped ? <ForwardOutlined style={{ color: '#fa8c16' }} /> :
               isError ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> :
               meta?.icon ?? '⏳'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 14, color: '#e6e6e6' }}>
                  Stage {stage.stageIndex}: {stage.stageName}
                </Text>
                {isRunning && (
                  <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>运行中</Tag>
                )}
                {isSkipped && (
                  <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>快速跳过</Tag>
                )}
                {isDone && stage.durationMs && (
                  <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                    {formatDuration(stage.durationMs)}
                  </Tag>
                )}
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

/** 结果展示面板 */
function ResultPanel({ result, durationMs }: { result: AnalyzeResult; durationMs: number }) {
  return (
    <Card style={{ background: '#1f1f1f', borderColor: '#303030' }}>
      <Result
        status="success"
        title="分析完成"
        subTitle={`总耗时 ${formatDuration(durationMs)}`}
      />
      <Row gutter={24} justify="center" style={{ marginTop: -24 }}>
        <Col>
          <Statistic
            title="变种对数"
            value={result.variantPairs}
            prefix={<ThunderboltOutlined />}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
        <Col>
          <Statistic
            title="函数定位"
            value={result.functionLocations}
            prefix={<FolderOpenOutlined />}
            valueStyle={{ color: '#13c2c2' }}
          />
        </Col>
        <Col>
          <Statistic
            title="调用树数"
            value={result.callTrees}
            prefix={<ApartmentOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
      </Row>
    </Card>
  );
}

/** 历史任务列表 */
function JobHistory({
  onSelect,
}: {
  onSelect: (jobId: string) => void;
}) {
  const [jobs, setJobs] = useState<AnalyzeJobStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyzeJobs()
      .then(res => setJobs(res.jobs as any))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="small" />;
  if (jobs.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <Divider style={{ borderColor: '#303030' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>历史任务</Text>
      </Divider>
      <List
        size="small"
        dataSource={jobs}
        renderItem={job => (
          <List.Item
            style={{
              padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
              border: '1px solid #252526', marginBottom: 4,
            }}
            onClick={() => onSelect(job.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Tag color={
                job.status === 'completed' ? 'success' :
                job.status === 'running' ? 'processing' :
                job.status === 'error' ? 'error' : 'default'
              } style={{ margin: 0 }}>
                {job.status === 'completed' ? '完成' :
                 job.status === 'running' ? '运行中' :
                 job.status === 'error' ? '失败' : '排队中'}
              </Tag>
              <Text style={{ flex: 1, color: '#e6e6e6' }}>
                {job.rawParams.join(', ')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatDuration(job.durationMs)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(job.startTime).toLocaleString('zh-CN', {
                  month: 'numeric', day: 'numeric',
                  hour: 'numeric', minute: 'numeric',
                })}
              </Text>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}

// ==================== Main Page ====================

export default function AnalyzePage() {
  const navigate = useNavigate();

  // Input state — inputValue 提升到父组件，解决"按钮灰色"问题
  const [rawParams, setRawParams] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [useCustomDir, setUseCustomDir] = useState(false);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progress, setProgress] = useState<StageProgress[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 修复 Bug #1: 用服务端返回的 startTime 计算 elapsed，不用本地 Date.now()
  const [serverStartTime, setServerStartTime] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalDurationMs, setFinalDurationMs] = useState<number | null>(null); // 完成后固定值
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const unsubRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // 修复 Bug #1: timer 基于 serverStartTime 计算
  const startTimer = useCallback((serverTime: number) => {
    setServerStartTime(serverTime);
    setFinalDurationMs(null);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - serverTime);
    }, 200);
  }, []);

  const stopTimer = useCallback((finalMs?: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (finalMs !== undefined) {
      setFinalDurationMs(finalMs);
    }
  }, []);

  // 显示时间：完成后用固定值，运行中用实时计算值
  const displayDuration = finalDurationMs ?? elapsedMs;

  // Subscribe to SSE updates for a job
  const subscribeToJob = useCallback((id: string, jobStartTime: number) => {
    if (unsubRef.current) unsubRef.current();

    const unsub = subscribeAnalyzeSSE(id, {
      onInit: (data) => {
        // 用 server 端 startTime 校准计时器
        if (data.startTime) {
          startTimer(data.startTime);
        }
        setJobStatus(data.status);
        if (data.progress.length > 0) {
          setProgress(data.progress);
        }
      },
      onStage: (stage) => {
        setProgress(prev => [...prev, stage]);
        if (stage.status === 'running') {
          setJobStatus('running');
        }
      },
      onStatus: (data) => {
        setJobStatus(data.status);
      },
      onComplete: (data) => {
        setJobStatus('completed');
        setResult(data.result);
        stopTimer(data.durationMs);
      },
      onError: (data) => {
        setJobStatus('error');
        setError(data.error);
        stopTimer(data.durationMs);
      },
      onDisconnect: () => {
        fetchAnalyzeJob(id).then(status => {
          setJobStatus(status.status);
          setProgress(status.progress);
          if (status.result) setResult(status.result);
          if (status.error) setError(status.error);
          stopTimer(status.durationMs);
        }).catch(() => {});
      },
    });

    unsubRef.current = unsub;
  }, [stopTimer]);

  // 判断输入框有没有有效内容（用于按钮启用判断）
  const pendingInput = inputValue.trim();
  const hasAnyParam = rawParams.length > 0 || pendingInput.length > 0;

  // Start analysis — 修复按钮灰色问题：自动提交输入框中的文字
  const handleSubmit = async () => {
    // 自动将输入框内容加入参数
    let finalParams = [...rawParams];
    if (pendingInput && !finalParams.includes(pendingInput)) {
      finalParams.push(pendingInput);
      setRawParams(finalParams);
      setInputValue('');
    }

    if (finalParams.length === 0) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    setProgress([]);
    setJobStatus('queued');
    setFinalDurationMs(null);

    try {
      const res = await createAnalyzeJob({
        rawParams: finalParams,
        targetDir: useCustomDir && targetDir ? targetDir : undefined,
      });

      setJobId(res.jobId);
      // 修复 Bug #1: 用服务端返回的任务创建时间作为起点
      const now = Date.now(); // 近似 server startTime
      startTimer(now);
      subscribeToJob(res.jobId, now);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
      setJobStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset
  const handleReset = () => {
    if (unsubRef.current) unsubRef.current();
    stopTimer();
    setJobId(null);
    setJobStatus('idle');
    setProgress([]);
    setResult(null);
    setError(null);
    setElapsedMs(0);
    setFinalDurationMs(null);
    setRawParams([]);
    setInputValue('');
  };

  // Load historical job
  const handleSelectJob = (selectedJobId: string) => {
    setJobId(selectedJobId);
    setProgress([]);
    setResult(null);
    setError(null);
    setJobStatus('running');
    const now = Date.now();
    startTimer(now);
    subscribeToJob(selectedJobId, now);
  };

  const isRunning = jobStatus === 'running' || jobStatus === 'queued';
  const isCompleted = jobStatus === 'completed';
  const isError = jobStatus === 'error';
  const showForm = jobStatus === 'idle';

  // 修复 Bug #2 #3: 使用推断逻辑补齐被跳过的 stage
  const stageStatuses = inferStageStatuses(progress);
  const completedCount = countCompletedStages(stageStatuses);
  const overallPercent = Math.round((completedCount / 5) * 100);

  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Header style={{
        background: '#1f1f1f', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px',
        borderBottom: '1px solid #303030',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#fff' }}
          />
          <ApartmentOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>新参数分析</Title>
        </div>
        {isRunning && (
          <Space>
            <LoadingOutlined spin style={{ color: '#1677ff' }} />
            <Text style={{ color: '#e6e6e6' }}>{formatDuration(displayDuration)}</Text>
          </Space>
        )}
      </Header>

      <Content style={{ padding: '32px 48px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {/* ===== Input Form ===== */}
        {showForm && (
          <>
            <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 24 }}>
              <Title level={5} style={{ color: '#e6e6e6', marginBottom: 20 }}>
                <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 8 }} />
                追踪参数
              </Title>

              <ParamTagInput
                params={rawParams}
                onChange={setRawParams}
                disabled={false}
                inputValue={inputValue}
                onInputChange={setInputValue}
              />

              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  输入需要追踪的参数名，支持多个参数。例如：ecom_scene_id, user_id, order_no
                </Text>
              </div>

              <Divider style={{ borderColor: '#303030', margin: '20px 0' }} />

              <div style={{ marginBottom: 16 }}>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setUseCustomDir(!useCustomDir)}
                  style={{ color: '#999', padding: 0 }}
                >
                  {useCustomDir ? <CloseOutlined /> : <FolderOpenOutlined />}
                  {useCustomDir ? ' 使用默认目录' : ' 自定义目标仓库路径'}
                </Button>
              </div>

              {useCustomDir && (
                <Input
                  placeholder="目标 Git 仓库路径 (留空使用服务器启动目录)"
                  value={targetDir}
                  onChange={e => setTargetDir(e.target.value)}
                  prefix={<FolderOpenOutlined style={{ color: '#666' }} />}
                  style={{ marginBottom: 16 }}
                />
              )}

              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleSubmit}
                loading={submitting}
                disabled={!hasAnyParam}
                block
                style={{ height: 48, fontSize: 16 }}
              >
                开始分析
              </Button>
            </Card>

            <Card size="small" style={{ background: '#1a1a1a', borderColor: '#252526' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 常见示例：追踪参数在代码中的数据流向，自动识别变种命名（如 ecom_scene_id → ecomSceneId → scene_id），
                定位所有使用该参数的函数，构建完整调用树并生成语义分析报告。
              </Text>
            </Card>

            <JobHistory onSelect={handleSelectJob} />
          </>
        )}

        {/* ===== Running / Completed / Error State ===== */}
        {!showForm && (
          <>
            {/* Job Info Header */}
            <Card size="small" style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space size="middle">
                  <Text type="secondary">任务:</Text>
                  {rawParams.map(p => (
                    <Tag key={p} color="processing" style={{ margin: 0 }}>{p}</Tag>
                  ))}
                  {jobId && (
                    <Text type="secondary" style={{ fontSize: 11 }}>{jobId}</Text>
                  )}
                </Space>
                {(isCompleted || isError) && (
                  <Button
                    type="primary"
                    ghost
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                  >
                    新分析
                  </Button>
                )}
              </div>
            </Card>

            {/* Overall Progress Bar — 修复 Bug #2: completedCount 包含推断的 skipped stage */}
            {isRunning && (
              <Card size="small" style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Progress
                    percent={overallPercent}
                    strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
                    trailColor="#303030"
                    style={{ flex: 1 }}
                    format={() => `${completedCount}/5`}
                  />
                  <Text style={{ color: '#e6e6e6', whiteSpace: 'nowrap' }}>
                    {formatDuration(displayDuration)}
                  </Text>
                </div>
              </Card>
            )}

            {/* Step Indicator — 修复 Bug #2: 使用 stageStatuses 推断 */}
            <Card style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}>
              <Steps
                current={getCurrentStepIndex(stageStatuses)}
                items={STAGE_STEPS.map((step, idx) => ({
                  ...step,
                  status: getStepStatus(idx + 1, stageStatuses),
                }))}
                size="small"
              />
            </Card>

            {/* Stage Timeline — 修复 Bug #3: 传入推断的 stageStatuses */}
            {(progress.length > 0 || stageStatuses.size > 0) && (
              <Card
                title={
                  <Text style={{ color: '#e6e6e6' }}>
                    <ClockCircleOutlined style={{ marginRight: 8 }} />
                    阶段进度
                  </Text>
                }
                style={{ background: '#1f1f1f', borderColor: '#303030', marginBottom: 16 }}
              >
                <StageTimeline progress={progress} stageStatuses={stageStatuses} />
              </Card>
            )}

            {/* Results */}
            {isCompleted && result && (
              <div style={{ marginBottom: 16 }}>
                <ResultPanel result={result} durationMs={displayDuration} />
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<EyeOutlined />}
                    onClick={() => navigate('/')}
                  >
                    查看分析结果
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {isError && error && (
              <Alert
                type="error"
                showIcon
                message="分析失败"
                description={error}
                action={
                  <Button onClick={handleReset} size="small">
                    重试
                  </Button>
                }
                style={{ marginBottom: 16 }}
              />
            )}
          </>
        )}
      </Content>
    </Layout>
  );
}
