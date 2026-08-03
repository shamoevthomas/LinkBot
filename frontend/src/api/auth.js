import client from './client';

// The API sleeps when idle and needs ~50s to cold-start, which blows past the
// client's default timeout — the request never reached the server and the user
// was told their credentials were wrong. Auth calls get a generous timeout so a
// cold start resolves into a real answer instead of a misleading failure.
const COLD_START_TIMEOUT = 75000;

export const login = (email, password) =>
  client
    .post('/auth/login', { email, password }, { timeout: COLD_START_TIMEOUT })
    .then((r) => r.data);

export const register = (email, password) =>
  client
    .post('/auth/register', { email, password }, { timeout: COLD_START_TIMEOUT })
    .then((r) => r.data);
