import client from './client';

export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data);

export const register = (email, password) =>
  client.post('/auth/register', { email, password }).then((r) => r.data);
