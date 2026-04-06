import client from './client';

export const getTags = () => client.get('/tags').then((r) => r.data);
export const createTag = (data) => client.post('/tags', data).then((r) => r.data);
export const deleteTag = (id) => client.delete(`/tags/${id}`).then((r) => r.data);
export const assignTag = (crmId, contactIds, tagId) =>
  client.post(`/crms/${crmId}/contacts/tag`, { contact_ids: contactIds, tag_id: tagId }).then((r) => r.data);
export const removeTag = (crmId, contactIds, tagId) =>
  client.delete(`/crms/${crmId}/contacts/tag`, { data: { contact_ids: contactIds, tag_id: tagId } }).then((r) => r.data);
