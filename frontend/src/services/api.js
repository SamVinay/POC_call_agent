/**
 * API service for communicating with the backend.
 */

const API_BASE = '/api';

async function fetchJSON(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
}

// --- Health ---
export const checkHealth = () => fetchJSON('/health');

// --- Calls ---
export const startCall = () =>
  fetchJSON('/calls/start', { method: 'POST' });

export const sendTextMessage = (callId, text) =>
  fetchJSON(`/calls/${callId}/message`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

export const endCall = (callId) =>
  fetchJSON(`/calls/${callId}/end`, { method: 'POST' });

export const getActiveCalls = () => fetchJSON('/calls/active');

export const getCallHistory = (limit = 50, urgency = null) => {
  const params = new URLSearchParams({ limit });
  if (urgency) params.append('urgency', urgency);
  return fetchJSON(`/calls/history?${params}`);
};

export const getCallDetail = (callId) => fetchJSON(`/calls/${callId}`);

// --- Appointments ---
export const getAppointments = (fromDate = null, status = null) => {
  const params = new URLSearchParams();
  if (fromDate) params.append('from_date', fromDate);
  if (status) params.append('status', status);
  return fetchJSON(`/appointments?${params}`);
};

export const createAppointment = (data) =>
  fetchJSON('/appointments', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateAppointment = (id, data) =>
  fetchJSON(`/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const rescheduleAppointment = (id, data) =>
  fetchJSON(`/appointments/${id}/reschedule`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteAppointment = (id) =>
  fetchJSON(`/appointments/${id}`, { method: 'DELETE' });

export const getAvailability = (targetDate = null, weekStart = null) => {
  const params = new URLSearchParams();
  if (targetDate) params.append('target_date', targetDate);
  if (weekStart) params.append('week_start', weekStart);
  return fetchJSON(`/appointments/availability?${params}`);
};

// --- Services ---
export const getServices = () => fetchJSON('/services');

// --- Dashboard ---
export const getDashboardStats = () => fetchJSON('/dashboard/stats');

// --- Call Messages ---
export const getCallMessages = (callId) => fetchJSON(`/calls/${callId}/messages`);

// --- Business Config ---
export const getBusinessConfig = () => fetchJSON('/config/business');

export const updateBusinessConfig = (data) =>
  fetchJSON('/config/business', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// --- WebSocket ---
export function createCallWebSocket(callId) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  return new WebSocket(`${protocol}://${host}/ws/call/${callId}`);
}
