import { Routes, Route, Navigate } from 'react-router-dom';
import RepoListPage from './pages/RepoListPage';
import RepoDetailPage from './pages/RepoDetailPage';
import ParamRootsPage from './pages/ParamRootsPage';
import TreeDetail from './pages/TreeDetail';

export default function App() {
  return (
    <Routes>
      {/* L1: 所有仓库列表 + 添加仓库 */}
      <Route path="/" element={<RepoListPage />} />

      {/* L2: 仓库详情 — 已分析参数列表 + 提交新分析 */}
      <Route path="/repo/:repoName" element={<RepoDetailPage />} />

      {/* L3: 参数下的调用树根列表 */}
      <Route path="/repo/:repoName/param/:rawParam" element={<ParamRootsPage />} />

      {/* L4: 调用树详情 */}
      <Route path="/repo/:repoName/param/:rawParam/tree" element={<TreeDetail />} />

      {/* 兼容旧路由 → 重定向到首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
