import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || 'An error occurred';
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('tc_token');
      localStorage.removeItem('tc_user');
      window.location.href = '/login';
    }
    return Promise.reject(new Error(msg));
  }
);

// Auth
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// Years
export const yearsApi = {
  getAll: () => api.get('/years'),
};

// Uploads
export const uploadsApi = {
  upload: (formData) => api.post('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll: (params) => api.get('/uploads', { params }),
  getById: (id) => api.get(`/uploads/${id}`),
  delete: (id) => api.delete(`/uploads/${id}`),
  compare: (upload1, upload2) => api.get('/uploads/compare', { params: { upload1, upload2 } }),
};

// Programs
export const programsApi = {
  getAll: (params) => api.get('/programs', { params }),
  getById: (id) => api.get(`/programs/${id}`),
  create: (data) => api.post('/programs', data),
  update: (id, data) => api.put(`/programs/${id}`, data),
  delete: (id) => api.delete(`/programs/${id}`),
  bulkDelete: (ids) => api.delete('/programs', { data: { ids } }),
  getFilterOptions: () => api.get('/programs/filter-options'),
};

// Analytics
export const analyticsApi = {
  getSummary: (params) => api.get('/analytics/summary', { params }),
  getByDepartment: (params) => api.get('/analytics/by-department', { params }),
  getByProgram: (params) => api.get('/analytics/by-program', { params }),
  getOpportunities: (params) => api.get('/analytics/opportunities', { params }),
  getTrends: (params) => api.get('/analytics/trends', { params }),
  getHeatmap: (params) => api.get('/analytics/heatmap', { params }),
  getAiInsights: (params) => api.get('/analytics/ai-insights', { params }),
  getTopPrograms: (params) => api.get('/analytics/top-programs', { params }),
};

// Users
export const usersApi = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  getRoles: () => api.get('/roles'),
};

// Audit
export const auditApi = {
  getLogs: (params) => api.get('/audit', { params }),
  getNotifications: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Health
export const healthApi = {
  get: () => api.get('/health'),
  getStats: () => api.get('/health/stats'),
};

export default api;
