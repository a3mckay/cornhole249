import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// ── League context ──────────────────────────────────────────────────────────
// All league-scoped API functions route through /api/l/:slug/...
// Call setCurrentLeague(slug) whenever the active league changes.

let _currentLeagueSlug = 'cornhole249';

export function setCurrentLeague(slug) {
  _currentLeagueSlug = slug;
}

function leagueBase() {
  return `/l/${_currentLeagueSlug}`;
}

// Auth (global — not league-scoped)
export const authApi = {
  me: () => axios.get('/auth/me', { withCredentials: true }).then((r) => r.data),

  // New-style email + password login
  login: (email, password) =>
    axios.post('/auth/login', { email, password }, { withCredentials: true }).then((r) => r.data),

  // Legacy PIN login — keeps existing Cornhole249 users functional; returns needs_migration:true
  loginLegacy: (userId, pin) =>
    axios.post('/auth/login', { user_id: userId, pin }, { withCredentials: true }).then((r) => r.data),

  // New-style registration (email + password, optional join code)
  register: ({ email, password, display_name, code, ref_token }) =>
    axios
      .post(
        '/auth/register',
        { email, password, display_name, ...(code ? { code } : {}), ...(ref_token ? { ref_token } : {}) },
        { withCredentials: true }
      )
      .then((r) => r.data),

  // Claim an existing PIN-only account and upgrade to email + password
  claimAccount: (userId, pin, email, password) =>
    axios
      .post('/auth/claim-account', { user_id: userId, pin, email, password }, { withCredentials: true })
      .then((r) => r.data),

  // Verify PIN in preparation for linking a Google account (claim-via-Google flow)
  claimVerifyPin: (userId, pin) =>
    axios
      .post('/auth/claim-verify-pin', { user_id: userId, pin }, { withCredentials: true })
      .then((r) => r.data),

  claimStub: (token) => axios.post('/auth/claim', { token }, { withCredentials: true }).then((r) => r.data),

  setupCredentials: (email, password) =>
    axios.post('/auth/setup-credentials', { email, password }, { withCredentials: true }).then((r) => r.data),

  logout: () => axios.post('/auth/logout', {}, { withCredentials: true }).then((r) => r.data),

  deleteAccount: () => axios.delete('/auth/account', { withCredentials: true }).then((r) => r.data),

  // PIPEDA right of access — triggers a JSON download of all stored personal data
  downloadMyData: async () => {
    const res = await fetch('/api/auth/my-data', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export data');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cornhole249-my-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Email verification
  verifyEmail: (token) =>
    axios.get(`/auth/verify-email/${token}`, { withCredentials: true }).then((r) => r.data),
  resendVerification: () =>
    axios.post('/auth/resend-verification', {}, { withCredentials: true }).then((r) => r.data),

  // Password reset
  forgotPassword: (email) =>
    axios.post('/auth/forgot-password', { email }, { withCredentials: true }).then((r) => r.data),
  resetPassword: (token, password) =>
    axios.post('/auth/reset-password', { token, password }, { withCredentials: true }).then((r) => r.data),
};

// Digest preferences
export const digestApi = {
  resubscribe: () => api.post('/digest/resubscribe').then((r) => r.data),
};

// Users
export const usersApi = {
  list: () => api.get(`${leagueBase()}/users`).then((r) => r.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data),
  update: (id, data) => api.patch(`/users/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

// Games
export const gamesApi = {
  list: (params) => api.get(`${leagueBase()}/games`, { params }).then((r) => r.data),
  dates: (params) => api.get(`${leagueBase()}/games/dates`, { params }).then((r) => r.data),
  get: (id) => api.get(`${leagueBase()}/games/${id}`).then((r) => r.data),
  create: (data) => api.post(`${leagueBase()}/games`, data).then((r) => r.data),
  update: (id, data) => api.patch(`/games/${id}`, data).then((r) => r.data),  // admin only
  delete: (id) => api.delete(`/games/${id}`, {}).then((r) => r.data),         // admin only
  pending: () => api.get(`${leagueBase()}/games/pending`).then((r) => r.data),
  approve: (id) => api.post(`${leagueBase()}/games/${id}/approve`).then((r) => r.data),
  dispute: (id) => api.post(`${leagueBase()}/games/${id}/dispute`).then((r) => r.data),
  submissions: () => api.get(`${leagueBase()}/games/submissions`).then((r) => r.data),
  retractSubmission: (id) => api.delete(`${leagueBase()}/games/submissions/${id}`).then((r) => r.data),
};

// Matches / series (best-of-N between two fixed sides) — ROADMAP WS-G
export const matchesApi = {
  list: (params) => api.get(`${leagueBase()}/matches`, { params }).then((r) => r.data),
  get: (id) => api.get(`${leagueBase()}/matches/${id}`).then((r) => r.data),
  create: (data) => api.post(`${leagueBase()}/matches`, data).then((r) => r.data),
};

// Comments
export const commentsApi = {
  post: (gameId, body) => api.post(`${leagueBase()}/games/${gameId}/comments`, { body }).then((r) => r.data),
  delete: (commentId) => api.delete(`/comments/${commentId}`).then((r) => r.data),
};

// Standings
export const standingsApi = {
  oneVone: (params) => api.get(`${leagueBase()}/standings/1v1`, { params }).then((r) => r.data),
  twoVtwo: (params) => api.get(`${leagueBase()}/standings/2v2`, { params }).then((r) => r.data),
  cutthroat: (params) => api.get(`${leagueBase()}/standings/cutthroat`, { params }).then((r) => r.data),
  history: (userId, params) => api.get(`${leagueBase()}/standings/history/${userId}`, { params }).then((r) => r.data),
  team: (p1, p2, params) => api.get(`${leagueBase()}/standings/team/${p1}/${p2}`, { params }).then((r) => r.data),
};

// Stats
export const statsApi = {
  rivals: (params) => api.get(`${leagueBase()}/stats/rivals`, { params }).then((r) => r.data),
  performers: (params) => api.get(`${leagueBase()}/stats/performers`, { params }).then((r) => r.data),
  h2h: (params) => api.get(`${leagueBase()}/stats/head-to-head`, { params }).then((r) => r.data),
  weather: (params) => api.get(`${leagueBase()}/stats/weather`, { params }).then((r) => r.data),
  venue: (params) => api.get(`${leagueBase()}/stats/venue`, { params }).then((r) => r.data),
  pointDiff: (params) => api.get(`${leagueBase()}/stats/point-differential`, { params }).then((r) => r.data),
  clutch: (params) => api.get(`${leagueBase()}/stats/clutch`, { params }).then((r) => r.data),
  recap: (params) => api.get(`${leagueBase()}/stats/recap`, { params }).then((r) => r.data),
  streaks: (params) => api.get(`${leagueBase()}/stats/streaks`, { params }).then((r) => r.data),
  venueKings: (params) => api.get(`${leagueBase()}/stats/venue-kings`, { params }).then((r) => r.data),
  eloLeaders: () => api.get(`${leagueBase()}/stats/elo-leaders`).then((r) => r.data),
  weatherPerformers: () => api.get(`${leagueBase()}/stats/weather-performers`).then((r) => r.data),
};

// Cross-sport "house" stats (global — keyed by league owner, not league-scoped).
export const houseApi = {
  overview: (ownerId) => api.get(`/house/${ownerId}/overview`).then((r) => r.data),
  h2h: (ownerId, p1, p2) => api.get(`/house/${ownerId}/h2h/${p1}/${p2}`).then((r) => r.data),
  nemesis: (ownerId, userId) => api.get(`/house/${ownerId}/nemesis/${userId}`).then((r) => r.data),
};

// Odds
export const oddsApi = {
  calculate: (data) => api.post(`${leagueBase()}/odds`, data).then((r) => r.data),
};

// Venues
export const venuesApi = {
  list: () => api.get(`${leagueBase()}/venues`).then((r) => r.data),
  create: (data) => api.post(`${leagueBase()}/venues`, data).then((r) => r.data),
  updateLocation: (id, lat, lng) => api.patch(`/venues/${id}`, { lat, lng }).then((r) => r.data),
};

// Tournaments
export const tournamentsApi = {
  list: (params) => api.get(`${leagueBase()}/tournaments`, { params }).then((r) => r.data),
  get: (id) => api.get(`${leagueBase()}/tournaments/${id}`).then((r) => r.data),
  create: (data) => api.post(`${leagueBase()}/tournaments`, data).then((r) => r.data),
  updateMatch: (matchId, data) => api.patch(`${leagueBase()}/tournament-matches/${matchId}`, data).then((r) => r.data),
};

// Achievements
export const achievementsApi = {
  forUser: (userId) => api.get(`${leagueBase()}/achievements/${userId}`).then((r) => r.data),
};

// Trash Talk
export const trashTalkApi = {
  list: (params) => api.get(`${leagueBase()}/trash-talk`, { params }).then((r) => r.data),
  post: (body) => api.post(`${leagueBase()}/trash-talk`, { body }).then((r) => r.data),
  delete: (id) => api.delete(`${leagueBase()}/trash-talk/${id}`).then((r) => r.data),
};

// Admin (global — not league-scoped)
export const adminApi = {
  users: () => api.get('/admin/users').then((r) => r.data),
  setAdmin: (userId, isAdmin) =>
    api.patch(`/admin/users/${userId}/admin`, { is_admin: isAdmin }).then((r) => r.data),
  bulkDeleteGames: (from, to) => api.delete('/admin/games', { data: { from, to } }).then((r) => r.data),
  joinCodes: () => api.get('/admin/join-codes').then((r) => r.data),
  generateCode: () => api.post('/admin/join-codes').then((r) => r.data),
  revokeCode: (code) => api.delete(`/admin/join-codes/${code}`).then((r) => r.data),
  referrals: () => api.get('/admin/referrals').then((r) => r.data),
  migrationStatus: () => api.get('/admin/migration-status').then((r) => r.data),
};

// Leagues (global — not league-scoped)
export const leaguesApi = {
  browse: (params) => api.get('/leagues', { params }).then((r) => r.data),
  mine: () => api.get('/leagues/mine').then((r) => r.data),
  create: (data) => api.post('/leagues', data).then((r) => r.data),
  get: (slug) => api.get(`/leagues/${slug}`).then((r) => r.data),
  update: (slug, data) => api.patch(`/leagues/${slug}`, data).then((r) => r.data),
  remove: (slug, confirm) => api.delete(`/leagues/${slug}`, { data: { confirm } }).then((r) => r.data),
  members: (slug) => api.get(`/leagues/${slug}/members`).then((r) => r.data),
  changeMemberRole: (slug, userId, role) => api.patch(`/leagues/${slug}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (slug, userId) => api.delete(`/leagues/${slug}/members/${userId}`).then((r) => r.data),
  generateCode: (slug) => api.post(`/leagues/${slug}/join-codes`).then((r) => r.data),
  // Invite token (private leagues)
  resetInviteToken: (slug) => api.post(`/leagues/${slug}/invite-token`).then((r) => r.data),
  touchInviteToken: (slug) => api.post(`/leagues/${slug}/invite-token/touch`).then((r) => r.data),
  // Join requests (public leagues)
  joinInfo: (slug) => api.get(`/leagues/${slug}/join-info`).then((r) => r.data),
  requestJoin: (slug, data) => api.post(`/leagues/${slug}/join-requests`, data).then((r) => r.data),
  getJoinRequests: (slug) => api.get(`/leagues/${slug}/join-requests`).then((r) => r.data),
  reviewJoinRequest: (slug, id, action) =>
    api.patch(`/leagues/${slug}/join-requests/${id}`, { action }).then((r) => r.data),
  // Downgrade grace period — admin manually chooses which 8 members keep access
  graceResolve: (slug, data) => api.post(`/leagues/${slug}/grace-resolve`, data).then((r) => r.data),
  // Logo upload / delete
  uploadLogo: (slug, file) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post(`/leagues/${slug}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  deleteLogo: (slug) => api.delete(`/leagues/${slug}/logo`).then((r) => r.data),
  regenerateShortCode: (slug) => api.post(`/leagues/${slug}/short-code`).then((r) => r.data),
  createStubPlayer: (slug, display_name) => api.post(`/leagues/${slug}/members/stub`, { display_name }).then((r) => r.data),
};

// Join / invite landing
export const joinApi = {
  getInvite: (code) => api.get(`/join/${code}`).then((r) => r.data),
  // Token-based (private league invite links)
  getToken: (token) => api.get(`/join?t=${encodeURIComponent(token)}`).then((r) => r.data),
  joinWithToken: (token) => api.post(`/join?t=${encodeURIComponent(token)}`).then((r) => r.data),
  // Short code (6-char reusable, direct join)
  getShortCode: (code) => api.get(`/join/short/${encodeURIComponent(code)}`).then((r) => r.data),
  joinWithShortCode: (code) => api.post(`/join/short/${encodeURIComponent(code)}`).then((r) => r.data),
  // Aliases used by FindLeague
  acceptToken: (token) => api.post(`/join?t=${encodeURIComponent(token)}`).then((r) => r.data),
  accept: (code) => api.post(`/join/${code}`).then((r) => r.data),
};

// Billing (Stripe Checkout + Customer Portal)
export const billingApi = {
  // Returns { venue: boolean } — whether the authenticated user has an active Venue Plan
  status: () =>
    api.get('/billing/status').then((r) => r.data),
  // Redirects to Stripe Checkout — call then window.location.href = data.url
  checkout: (leagueId, plan) =>
    api.post('/billing/checkout', { leagueId, plan }).then((r) => r.data),
  // Redirects to Stripe Customer Portal — omit leagueId for venue-plan sessions
  portal: (leagueId) =>
    api.post('/billing/portal', leagueId ? { leagueId } : {}).then((r) => r.data),
};

// Admin — billing/plan grants
export const adminBillingApi = {
  leagues: () => api.get('/admin/leagues').then((r) => r.data),
  setPlanOverride: (leagueId, plan_override, reason) =>
    api.patch(`/admin/leagues/${leagueId}/plan`, { plan_override, reason }).then((r) => r.data),
};

export default api;
