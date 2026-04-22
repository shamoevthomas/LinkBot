import client from './client';

export const getDashboardStats = () => client.get('/dashboard/stats').then((r) => r.data);
export const getNotifications = () => client.get('/dashboard/notifications').then((r) => r.data);
export const getLinkedInProfile = () => client.get('/dashboard/linkedin-profile').then((r) => r.data);
