// API client for ParkPulse
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An unexpected error occurred';
    return Promise.reject({ ...error, message });
  }
);
  
export default api;

// Auth
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Student
export const studentApi = {
  dashboard: () => api.get('/student/dashboard'),
  verifyLocation: (data) => api.post('/student/verify-location', data),
  availability: () => api.get('/student/availability'),
  requestSlot: (data) => api.post('/student/request-slot', data),
  confirmParking: (allocationId) => api.post('/student/confirm-parking', { allocationId }),
  exitParking: (allocationId) => api.post('/student/exit-parking', { allocationId }),
  cancelAllocation: (allocationId) => api.post('/student/cancel-allocation', { allocationId }),
  queuePosition: () => api.get('/student/queue-position'),
  acceptQueueOffer: (queueEntryId) => api.post('/student/accept-queue-offer', { queueEntryId }),
  declineQueueOffer: (queueEntryId) => api.post('/student/decline-queue-offer', { queueEntryId }),
  history: () => api.get('/student/history'),
  notifications: () => api.get('/student/notifications'),
  markNotificationsRead: () => api.post('/student/mark-notifications-read'),
  route: (slotId) => api.get(`/student/route/${slotId}`),
};

// Admin
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  slots: () => api.get('/admin/slots'),
  createSlot: (data) => api.post('/admin/slots', data),
  updateSlot: (slotId, data) => api.patch(`/admin/slots/${slotId}`, data),
  blockSlot: (slotId, data) => api.post(`/admin/slots/${slotId}/block`, data),
  unblockSlot: (slotId) => api.post(`/admin/slots/${slotId}/unblock`),
  setPriorities: (priorities) => api.post('/admin/slots/priority', { priorities }),
  zones: () => api.get('/admin/zones'),
  createZone: (data) => api.post('/admin/zones', data),
  geofence: () => api.get('/admin/geofence'),
  updateGeofence: (data) => api.post('/admin/geofence', data),
  simulateOccupancy: (data) => api.post('/admin/simulate-occupancy', data),
  analytics: () => api.get('/admin/analytics'),
  users: () => api.get('/admin/users'),
  grantManualApproval: (data) => api.post('/admin/manual-location-approval', data),
  resetDemo: () => api.post('/admin/reset-demo'),
};

// Public
export const publicApi = {
  stats: () => api.get('/public/stats'),
  health: () => api.get('/health'),
};
