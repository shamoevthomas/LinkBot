import client from './client';

export const getMe = () => client.get('/user/me').then((r) => r.data);

export const updateCookies = (li_at, jsessionid) =>
  client.put('/user/cookies', { li_at, jsessionid }).then((r) => r.data);

export const getCookiesStatus = () =>
  client.get('/user/cookies/status').then((r) => r.data);

export const submitOnboarding = (formData) =>
  client.post('/user/onboarding', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const updateProfile = (formData) =>
  client.put('/user/profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
