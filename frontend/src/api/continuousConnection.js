import client from './client';

export const getContinuousConnection = () =>
  client.get('/continuous-connection').then((r) => r.data);

export const updateContinuousConnection = (payload) =>
  client.put('/continuous-connection', payload).then((r) => r.data);
