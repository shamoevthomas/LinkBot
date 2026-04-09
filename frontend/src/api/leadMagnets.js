import client from './client';

export const getLeadMagnets = () =>
  client.get('/lead-magnets').then((r) => r.data);
export const createLeadMagnet = (data) =>
  client.post('/lead-magnets', data).then((r) => r.data);
export const getLeadMagnet = (id) =>
  client.get(`/lead-magnets/${id}`).then((r) => r.data);
export const updateLeadMagnet = (id, data) =>
  client.patch(`/lead-magnets/${id}`, data).then((r) => r.data);
export const deleteLeadMagnet = (id) =>
  client.delete(`/lead-magnets/${id}`).then((r) => r.data);
export const startLeadMagnet = (id) =>
  client.post(`/lead-magnets/${id}/start`).then((r) => r.data);
export const pauseLeadMagnet = (id) =>
  client.post(`/lead-magnets/${id}/pause`).then((r) => r.data);
export const resumeLeadMagnet = (id) =>
  client.post(`/lead-magnets/${id}/resume`).then((r) => r.data);
export const cancelLeadMagnet = (id) =>
  client.post(`/lead-magnets/${id}/cancel`).then((r) => r.data);
export const triggerLeadMagnet = (id) =>
  client.post(`/lead-magnets/${id}/trigger`).then((r) => r.data);
export const getLeadMagnetContacts = (id) =>
  client.get(`/lead-magnets/${id}/contacts`).then((r) => r.data);
