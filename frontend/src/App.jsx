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

// Plan Data module pages
import PlanDashboard from './pages/PlanDashboard/index';
import PlanOverview from './pages/PlanOverview/index';
import PlanUploadPage from './pages/PlanUpload/index';
import PlanDataViewer from './pages/PlanDataViewer/index';
import PlanAnalytics from './pages/PlanAnalytics/index';
import PlanManualEntry from './pages/PlanManualEntry/index';

// Default landing page for all roles — never redirect here from a blocked route,
// it must stay open to every authenticated role (including Viewer).
const DEFAULT_ROUTE = '/plan/overview';

function ProtectedRoute({ children, roles }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to={DEFAULT_ROUTE} replace />;
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
          {/* Legacy dashboard — not available to Viewer */}
          <Route index element={<ProtectedRoute roles={['admin', 'manager']}><Dashboard /></ProtectedRoute>} />
          <Route path="upload" element={<ProtectedRoute roles={['admin', 'manager']}><UploadPage /></ProtectedRoute>} />
          <Route path="data-viewer" element={<ProtectedRoute roles={['admin', 'manager']}><DataViewer /></ProtectedRoute>} />
          <Route path="analytics" element={<ProtectedRoute roles={['admin', 'manager']}><Analytics /></ProtectedRoute>} />
          <Route path="manual-entry" element={<ProtectedRoute roles={['admin', 'manager']}><ManualEntry /></ProtectedRoute>} />
          <Route path="audit" element={<ProtectedRoute roles={['admin', 'manager']}><Audit /></ProtectedRoute>} />
          <Route path="health" element={<ProtectedRoute roles={['admin', 'manager']}><Health /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />

          {/* New Plan Data dashboard */}
          <Route path="plan/overview" element={<PlanOverview />} />
          <Route path="plan" element={<PlanDashboard />} />
          <Route path="plan/upload" element={<ProtectedRoute roles={['admin', 'manager']}><PlanUploadPage /></ProtectedRoute>} />
          <Route path="plan/data-viewer" element={<PlanDataViewer />} />
          <Route path="plan/analytics" element={<ProtectedRoute roles={['admin', 'manager']}><PlanAnalytics /></ProtectedRoute>} />
          <Route path="plan/manual-entry" element={<ProtectedRoute roles={['admin', 'manager']}><PlanManualEntry /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
