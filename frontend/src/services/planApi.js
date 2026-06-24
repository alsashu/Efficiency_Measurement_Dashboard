import api from './api';

export const planYearsApi = {
  getAll: () => api.get('/plan/years'),
};

export const planUploadsApi = {
  validate: (formData) => api.post('/plan/uploads/validate', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  upload: (formData) => api.post('/plan/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll: (params) => api.get('/plan/uploads', { params }),
  getById: (id) => api.get(`/plan/uploads/${id}`),
  delete: (id) => api.delete(`/plan/uploads/${id}`),
};

export const planProgramsApi = {
  getAll: (params) => api.get('/plan/programs', { params }),
  getById: (id) => api.get(`/plan/programs/${id}`),
  create: (data) => api.post('/plan/programs', data),
  update: (id, data) => api.put(`/plan/programs/${id}`, data),
  delete: (id) => api.delete(`/plan/programs/${id}`),
  getFilterOptions: () => api.get('/plan/programs/filter-options'),
};

export const planAnalyticsApi = {
  getSummary: (params) => api.get('/plan/analytics/summary', { params }),
  getByDepartment: (params) => api.get('/plan/analytics/by-department', { params }),
  getByProgram: (params) => api.get('/plan/analytics/by-program', { params }),
  getTrends: (params) => api.get('/plan/analytics/trends', { params }),
  getTopPrograms: (params) => api.get('/plan/analytics/top-programs', { params }),
  getPeriodOptions: () => api.get('/plan/analytics/period-options'),
  getKpiDetail: (params) => api.get('/plan/analytics/kpi-detail', { params }),
};
