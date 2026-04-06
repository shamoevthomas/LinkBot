import client from './client';

export const getNotificationsList = () => client.get('/notifications').then((r) => r.data);
export const markNotificationRead = (id) => client.patch(`/notifications/${id}/read`).then((r) => r.data);
export const markAllNotificationsRead = () => client.post('/notifications/read-all').then((r) => r.data);
