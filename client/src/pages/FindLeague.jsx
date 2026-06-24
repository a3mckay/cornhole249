import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { leaguesApi, joinApi } from '../api';
import { useAuth } from '../hooks/useAuth';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function FindLeague() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [codeInput, setCodeInput] = useState(searchParams.get('code') || '');
  const [codeResult, setCodeResult] = useState(null);
  const [codeLookingUp, setCodeLookingUp] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeJoining, setCodeJoining] = useState(false);

  const [query, setQuery] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [total, setTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [requestedSlugs, setRequestedSlugs] = useState(new Set());
  const [requestingSlug, setRequestingSlug] = useState(null);

  const PER_PAGE = 12;

  const loadLeagues = useCallback(async (q, page) => {
    setBrowseLoading(true);
    try {
      const { leagues: rows, total: t } = await leaguesApi.browse({ q, page, limit: PER_PAGE });
      setLeagues(rows);
      setTotal(t);
    } catch (_) {
      setLeagues([]);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedLoad = useCallback(debounce((q) => { setBrowsePage(1); loadLeagues(q, 1); }, 300), [loadLeagues]);

  useEffect(() => { loadLeagues(query, browsePage); }, [browsePage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { debouncedLoad(query); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // If a code was pre-populated from query string, look it up immediately
  useEffect(() => {
    if (codeInput.trim()) handleCodeLookup(codeInput.trim());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCodeLookup = async (rawCode) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) { setCodeResult(null); setCodeError(''); return; }
    setCodeLookingUp(true);
    setCodeError('');
    setCodeResult(null);
    try {
      let result;

      if (code.length > 8) {
        // Long string → invite token
        result = { ...(await joinApi.getToken(code)), _matchType: 'token', _raw: code };
      } else if (code.length === 6) {
        // Exactly 6 chars → try short code first (most common for typed/printed codes)
        result = { ...(await joinApi.getShortCode(code)), _matchType: 'short_code', _raw: code };
        if (!result.valid) {
          // Fall back to legacy invite code
          result = { ...(await joinApi.getInvite(code)), _matchType: 'legacy', _raw: code };
        }
      } else {
        // Other lengths → legacy invite code, then try token
        result = { ...(await joinApi.getInvite(code)), _matchType: 'legacy', _raw: code };
        if (!result.valid) {
          result = { ...(await joinApi.getToken(code)), _matchType: 'token', _raw: code };
        }
      }

      if (!result.valid) {
        setCodeError('Code not found or has expired.');
      } else {
        setCodeResult(result);
      }
    } catch (_) {
      setCodeError('Something went wrong. Check the code and try again.');
    } finally {
      setCodeLookingUp(false);
    }
  };

  const handleCodeJoin = async () => {
    if (!codeResult) return;
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/find-league?code=${codeResult._raw}`)}`);
      return;
    }
    setCodeJoining(true);
    try {
      const { _matchType, _raw } = codeResult;
      let slug;
      if (_matchType === 'short_code') {
        const r = await joinApi.joinWithShortCode(_raw);
        slug = r.slug;
      } else if (_matchType === 'token') {
        const r = await joinApi.acceptToken(_raw);
        slug = r.slug;
      } else {
        const r = await joinApi.accept(_raw);
        slug = r.slug || codeResult.slug;
      }
      navigate(`/l/${slug}/standings`);
    } catch (e) {
      setCodeError(e.response?.data?.error || 'Failed to join league.');
      setCodeJoining(false);
    }
  };

  const handleRequestJoin = async (leagueSlug) => {
    if (!user) { navigate('/login?returnTo=/find-league'); return; }
    setRequestingSlug(leagueSlug);
    try {
      await leaguesApi.requestJoin(leagueSlug, {});
      setRequestedSlugs((prev) => new Set([...prev, leagueSlug]));
    } catch (_) {
      // Silent fail
    } finally {
      setRequestingSlug(null);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-lg mx-auto mt-8 flex flex-col gap-6 px-4 pb-16">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-2xl opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--color-text-primary)' }}
        >
          ←
        </button>
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
            Find a League
          </h1>
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Join with a code or browse public leagues
          </p>
        </div>
      </div>

      {/* Join by code */}
      <div className="card p-6">
        <h2 className="font-display text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Enter a code
        </h2>
        <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Got an invite link or join code? Paste it here.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCodeLookup(codeInput); }}
            placeholder="Invite code or token…"
            className="flex-1 rounded-xl px-4 py-2.5 font-ui text-sm border"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <button
            onClick={() => handleCodeLookup(codeInput)}
            disabled={codeLookingUp || !codeInput.trim()}
            className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {codeLookingUp ? '…' : 'Look up'}
          </button>
        </div>

        {codeError && (
          <p className="font-ui text-sm mt-3" style={{ color: 'var(--color-danger)' }}>{codeError}</p>
        )}

        {codeResult && !codeResult.already_member && (
          <div
            className="mt-4 rounded-xl p-4 flex items-center justify-between gap-4"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            <div className="min-w-0">
              <div className="font-display text-base" style={{ color: 'var(--color-text-primary)' }}>
                {codeResult.league_name || codeResult.name}
              </div>
              {codeResult.tagline && (
                <div className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{codeResult.tagline}</div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {codeResult.member_count || 0} members
                </span>
                {codeResult._matchType === 'short_code' && (
                  <span
                    className="text-xs font-ui font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#D1FAE5', color: '#065F46' }}
                  >
                    Direct join
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleCodeJoin}
              disabled={codeJoining}
              className="btn btn-primary text-sm px-4 py-2 flex-shrink-0 disabled:opacity-50"
            >
              {codeJoining ? 'Joining…' : user ? 'Join' : 'Sign in to join'}
            </button>
          </div>
        )}

        {codeResult?.already_member && (
          <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              You are already a member of <strong style={{ color: 'var(--color-text-primary)' }}>{codeResult.name}</strong>.{' '}
              <Link to={`/l/${codeResult.slug}/standings`} style={{ color: 'var(--color-primary)' }}>Go to league →</Link>
            </p>
          </div>
        )}
      </div>

      {/* Browse public leagues */}
      <div className="card p-6">
        <h2 className="font-display text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Browse public leagues
        </h2>
        <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Find and request to join any public league.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-xl px-4 py-2.5 font-ui text-sm border mb-4"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />

        {browseLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ color: 'var(--color-primary)' }} />
          </div>
        ) : leagues.length === 0 ? (
          <p className="font-ui text-sm text-center py-8" style={{ color: 'var(--color-text-secondary)' }}>
            {query ? 'No leagues match your search.' : 'No public leagues yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {leagues.map((l) => {
              const alreadyRequested = requestedSlugs.has(l.slug);
              return (
                <div
                  key={l.slug}
                  className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
                >
                  {l.theme_json?.logo_path ? (
                    <img
                      src={`/uploads${l.theme_json.logo_path}`}
                      alt={l.name}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-display text-lg font-bold"
                      style={{ background: 'var(--color-primary)', color: 'white' }}
                    >
                      {l.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-ui font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {l.name}
                    </div>
                    {l.tagline && (
                      <div className="font-ui text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{l.tagline}</div>
                    )}
                    <div className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {l.member_count} {l.member_count === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRequestJoin(l.slug)}
                    disabled={alreadyRequested || requestingSlug === l.slug}
                    className="btn text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-50"
                    style={alreadyRequested
                      ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }
                      : { background: 'var(--color-primary)', color: 'white' }
                    }
                  >
                    {alreadyRequested ? 'Requested' : requestingSlug === l.slug ? '…' : 'Request to join'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-5">
            <button
              onClick={() => setBrowsePage((p) => Math.max(1, p - 1))}
              disabled={browsePage === 1}
              className="btn text-sm px-3 py-1.5 disabled:opacity-40"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              ← Prev
            </button>
            <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {browsePage} / {totalPages}
            </span>
            <button
              onClick={() => setBrowsePage((p) => Math.min(totalPages, p + 1))}
              disabled={browsePage === totalPages}
              className="btn text-sm px-3 py-1.5 disabled:opacity-40"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {!user && (
        <p className="font-ui text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
          <Link to="/login" style={{ color: 'var(--color-primary)' }}>Log in</Link> or{' '}
          <Link to="/register" style={{ color: 'var(--color-primary)' }}>register</Link> to join leagues.
        </p>
      )}
    </div>
  );
}
