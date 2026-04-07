import client from './client';

export const getCampaigns = (params) =>
  client.get('/campaigns', { params }).then((r) => r.data);
export const createCampaign = (data) =>
  client.post('/campaigns', data).then((r) => r.data);
export const getCampaign = (id) =>
  client.get(`/campaigns/${id}`).then((r) => r.data);
export const updateCampaign = (id, data) =>
  client.patch(`/campaigns/${id}`, data).then((r) => r.data);
export const startCampaign = (id) =>
  client.post(`/campaigns/${id}/start`).then((r) => r.data);
export const pauseCampaign = (id) =>
  client.post(`/campaigns/${id}/pause`).then((r) => r.data);
export const resumeCampaign = (id) =>
  client.post(`/campaigns/${id}/resume`).then((r) => r.data);
export const cancelCampaign = (id) =>
  client.post(`/campaigns/${id}/cancel`).then((r) => r.data);
export const deleteCampaign = (id) =>
  client.delete(`/campaigns/${id}`).then((r) => r.data);
export const duplicateCampaign = (id) =>
  client.post(`/campaigns/${id}/duplicate`).then((r) => r.data);
export const diagnoseCampaign = (id) =>
  client.get(`/campaigns/${id}/diagnose`).then((r) => r.data);
export const runCampaignNow = (id) =>
  client.post(`/campaigns/${id}/run-now`).then((r) => r.data);
export const getCampaignActions = (id, params) =>
  client.get(`/campaigns/${id}/actions`, { params }).then((r) => r.data);
export const getCampaignContacts = (id, params) =>
  client.get(`/campaigns/${id}/contacts`, { params }).then((r) => r.data);
export const updateContactStatus = (campaignId, contactId, status) =>
  client.patch(`/campaigns/${campaignId}/contacts/${contactId}/status`, { status }).then((r) => r.data);
