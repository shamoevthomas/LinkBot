import client from './client';

export const getSettings = () => client.get('/config/settings').then((r) => r.data);
export const updateSettings = (data) => client.put('/config/settings', data).then((r) => r.data);
export const importConnections = (crmId) =>
  client.post('/config/import-connections', { crm_id: crmId }).then((r) => r.data);
export const importCSV = (formData) =>
  client.post('/config/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
export const getLogs = (params) => client.get('/config/logs', { params }).then((r) => r.data);
export const getImportStatus = () => client.get('/config/import-status').then((r) => r.data);
