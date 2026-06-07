import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useThemeStore, useAuthStore } from './store/useStore';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Auth/Login';
import Dashboard from './pages/Dashboard/index';
import UploadPage from './pages/Upload/index';
import DataViewer from './pages/DataViewer/index';
import Analytics from './pages/Analytics/index';
import ManualEntry from './pages/ManualEntry/index';
import Audit from './pages/Audit/index';
import Health from './pages/Health/index';
import Settings from './pages/Settings/index';

function ProtectedRoute({ children, roles }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { initTheme } = useThemeStore();
  useEffect(() => { initTheme(); }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<ProtectedRoute roles={['admin','manager']}><UploadPage /></ProtectedRoute>} />
          <Route path="data-viewer" element={<DataViewer />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="manual-entry" element={<ProtectedRoute roles={['admin','manager']}><ManualEntry /></ProtectedRoute>} />
          <Route path="audit" element={<ProtectedRoute roles={['admin','manager']}><Audit /></ProtectedRoute>} />
          <Route path="health" element={<Health />} />
          <Route path="settings" element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
