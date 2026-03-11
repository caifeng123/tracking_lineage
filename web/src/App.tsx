import { Routes, Route, Navigate } from 'react-router-dom';
import RootList from './pages/RootList';
import TreeDetail from './pages/TreeDetail';
import AnalyzePage from './pages/AnalyzePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootList />} />
      <Route path="/tree/:rawParam" element={<TreeDetail />} />
      <Route path="/analyze" element={<AnalyzePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
