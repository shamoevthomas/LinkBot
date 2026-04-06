import client from './client';

export const getCRMs = () => client.get('/crms').then((r) => r.data);
export const createCRM = (data) => client.post('/crms', data).then((r) => r.data);
export const getCRM = (id) => client.get(`/crms/${id}`).then((r) => r.data);
export const updateCRM = (id, data) => client.put(`/crms/${id}`, data).then((r) => r.data);
export const deleteCRM = (id) => client.delete(`/crms/${id}`).then((r) => r.data);

export const getContacts = (crmId, params) =>
  client.get(`/crms/${crmId}/contacts`, { params }).then((r) => r.data);
export const addContact = (crmId, data) =>
  client.post(`/crms/${crmId}/contacts`, data).then((r) => r.data);
export const deleteContacts = (crmId, contactIds) =>
  client.delete(`/crms/${crmId}/contacts`, { data: { contact_ids: contactIds } }).then((r) => r.data);
export const moveContacts = (crmId, contactIds, targetCrmId) =>
  client.post(`/crms/${crmId}/contacts/move`, { contact_ids: contactIds, target_crm_id: targetCrmId }).then((r) => r.data);
export const updateContactsStatus = (crmId, contactIds, connectionStatus) =>
  client.patch(`/crms/${crmId}/contacts/status`, { contact_ids: contactIds, connection_status: connectionStatus }).then((r) => r.data);
export const sendMessageToContact = (crmId, contactId, message) =>
  client.post(`/crms/${crmId}/contacts/${contactId}/message`, { message }).then((r) => r.data);
export const searchLinkedInPeople = (query) =>
  client.get('/crms/search/people', { params: { q: query } }).then((r) => r.data);
export const generateAIMessage = (crmId, contactId, instructions) =>
  client.post(`/crms/${crmId}/contacts/${contactId}/generate-message`, { instructions }).then((r) => r.data);
export const exportContacts = (crmId, params) =>
  client.get(`/crms/${crmId}/contacts/export`, { params, responseType: 'blob' }).then((r) => r.data);
export const getAllContacts = (params) =>
  client.get('/crms/all-contacts', { params }).then((r) => r.data);
