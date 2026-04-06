import client from './client';

export const getBlacklist = (params) => client.get('/blacklist', { params }).then((r) => r.data);
export const addToBlacklist = (data) => client.post('/blacklist', data).then((r) => r.data);
export const removeFromBlacklist = (id) => client.delete(`/blacklist/${id}`).then((r) => r.data);
