import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Auth
export const authApi = {
  me: () => axios.get('/auth/me', { withCredentials: true }).then((r) => r.data),
  login: (userId, pin) =>
    axios.post('/auth/login', { user_id: userId, pin }, { withCredentials: true }).then((r) => r.data),
  register: (code, display_name, pin) =>
    axios.post('/auth/register', { code, display_name, pin }, { withCredentials: true }).then((r) => r.data),
  logout: () => axios.post('/auth/logout', {}, { withCredentials: true }).then((r) => r.data),
  setPin: (pin) => axios.post('/auth/set-pin', { pin }, { withCredentials: true }).then((r) => r.data),
};

// Users
export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data),
  update: (id, data) => api.patch(`/users/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

// Games
export const gamesApi = {
  list: (params) => api.get('/games', { params }).then((r) => r.data),
  get: (id) => api.get(`/games/${id}`).then((r) => r.data),
  create: (data) => api.post('/games', data).then((r) => r.data),
  update: (id, data) => api.patch(`/games/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/games/${id}`).then((r) => r.data),
};

// Comments
export const commentsApi = {
  post: (gameId, body) => api.post(`/games/${gameId}/comments`, { body }).then((r) => r.data),
  delete: (commentId) => api.delete(`/comments/${commentId}`).then((r) => r.data),
};

// Standings
export const standingsApi = {
  oneVone: (params) => api.get('/standings/1v1', { params }).then((r) => r.data),
  twoVtwo: (params) => api.get('/standings/2v2', { params }).then((r) => r.data),
  history: (userId, params) => api.get(`/standings/history/${userId}`, { params }).then((r) => r.data),
  team: (p1, p2) => api.get(`/standings/team/${p1}/${p2}`).then((r) => r.data),
};

// Stats
export const statsApi = {
  rivals: () => api.get('/stats/rivals').then((r) => r.data),
  performers: (params) => api.get('/stats/performers', { params }).then((r) => r.data),
  h2h: (params) => api.get('/stats/head-to-head', { params }).then((r) => r.data),
  weather: (params) => api.get('/stats/weather', { params }).then((r) => r.data),
  venue: (params) => api.get('/stats/venue', { params }).then((r) => r.data),
  pointDiff: (params) => api.get('/stats/point-differential', { params }).then((r) => r.data),
  clutch: (params) => api.get('/stats/clutch', { params }).then((r) => r.data),
  recap: (params) => api.get('/stats/recap', { params }).then((r) => r.data),
};

// Odds
export const oddsApi = {
  calculate: (data) => api.post('/odds', data).then((r) => r.data),
};

// Venues
export const venuesApi = {
  list: () => api.get('/venues').then((r) => r.data),
  create: (data) => api.post('/venues', data).then((r) => r.data),
};

// Tournaments
export const tournamentsApi = {
  list: (params) => api.get('/tournaments', { params }).then((r) => r.data),
  get: (id) => api.get(`/tournaments/${id}`).then((r) => r.data),
  create: (data) => api.post('/tournaments', data).then((r) => r.data),
  updateMatch: (matchId, data) => api.patch(`/tournament-matches/${matchId}`, data).then((r) => r.data),
};

// Achievements
export const achievementsApi = {
  forUser: (userId) => api.get(`/achievements/${userId}`).then((r) => r.data),
};

// Trash Talk
export const trashTalkApi = {
  list: (params) => api.get('/trash-talk', { params }).then((r) => r.data),
  post: (body) => api.post('/trash-talk', { body }).then((r) => r.data),
  delete: (id) => api.delete(`/trash-talk/${id}`).then((r) => r.data),
};

// Admin
export const adminApi = {
  users: () => api.get('/admin/users').then((r) => r.data),
  setAdmin: (userId, isAdmin) =>
    api.patch(`/admin/users/${userId}/admin`, { is_admin: isAdmin }).then((r) => r.data),
  bulkDeleteGames: (from, to) => api.delete('/admin/games', { data: { from, to } }).then((r) => r.data),
  joinCodes: () => api.get('/admin/join-codes').then((r) => r.data),
  generateCode: () => api.post('/admin/join-codes').then((r) => r.data),
  revokeCode: (code) => api.delete(`/admin/join-codes/${code}`).then((r) => r.data),
};

export default api;
