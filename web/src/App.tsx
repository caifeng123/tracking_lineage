import { Routes, Route, Navigate } from 'react-router-dom';
import RootList from './pages/RootList';
import TreeDetail from './pages/TreeDetail';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootList />} />
      <Route path="/tree/:rawParam/:rootId" element={<TreeDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
