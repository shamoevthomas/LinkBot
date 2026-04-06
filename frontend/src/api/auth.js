import client from './client';

export const login = (username, password) =>
  client.post('/auth/login', { username, password }).then((r) => r.data);

export const register = (username, email, password) =>
  client.post('/auth/register', { username, email, password }).then((r) => r.data);
