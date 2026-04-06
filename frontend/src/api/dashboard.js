import client from './client';

export const getDashboardStats = () => client.get('/dashboard/stats').then((r) => r.data);
export const getNotifications = () => client.get('/dashboard/notifications').then((r) => r.data);
export const getAnalytics = () => client.get('/dashboard/analytics').then((r) => r.data);
