import { describe, test, expect, vi, beforeEach } from 'vitest';

// api.js builds an axios instance at import time — hand it a controllable get().
const get = vi.fn();
vi.mock('axios', () => ({
  default: { create: () => ({ get }), get: vi.fn(), post: vi.fn() },
}));

const { usersApi, venuesApi, clearRosterCache, setRosterOwner, setCurrentLeague, prefetchRoster } = await import('../api');

const ALICE = { id: 1, display_name: 'Alice' };
const BOB = { id: 2, display_name: 'Bob' };

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
  clearRosterCache();
  setCurrentLeague('pool');
});

describe('roster cache', () => {
  test('peek is empty until a list has been fetched, then returns it', async () => {
    expect(usersApi.peek()).toBeNull();
    get.mockResolvedValueOnce({ data: [ALICE, BOB] });

    await expect(usersApi.list()).resolves.toEqual([ALICE, BOB]);
    expect(get).toHaveBeenCalledWith('/l/pool/users');
    expect(usersApi.peek()).toEqual([ALICE, BOB]);
  });

  test('survives a reload via localStorage', async () => {
    get.mockResolvedValueOnce({ data: [ALICE] });
    await usersApi.list();
    const stored = JSON.parse(localStorage.getItem('c249:roster:users:pool'));
    expect(stored).toEqual([ALICE]);
  });

  test('is scoped per league', async () => {
    get.mockResolvedValueOnce({ data: [ALICE] });
    await usersApi.list();
    expect(usersApi.peek('cornhole249')).toBeNull();

    get.mockResolvedValueOnce({ data: [BOB] });
    await usersApi.list('cornhole249');
    expect(get).toHaveBeenLastCalledWith('/l/cornhole249/users');
    expect(usersApi.peek('cornhole249')).toEqual([BOB]);
    expect(usersApi.peek('pool')).toEqual([ALICE]);
  });

  test('concurrent requests share one network call but get separate arrays', async () => {
    let resolve;
    get.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const a = usersApi.list();
    const b = usersApi.list();
    resolve({ data: [BOB, ALICE] });
    const [ra, rb] = await Promise.all([a, b]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    ra.sort((x, y) => x.id - y.id); // one caller sorting in place…
    expect(rb[0]).toBe(BOB);        // …doesn't reorder the other's copy
  });

  test('a failed refresh keeps the last good copy', async () => {
    get.mockResolvedValueOnce({ data: [ALICE] });
    await usersApi.list();
    get.mockRejectedValueOnce(new Error('offline'));
    await expect(usersApi.list()).rejects.toThrow('offline');
    expect(usersApi.peek()).toEqual([ALICE]);
  });

  test('venues are cached the same way', async () => {
    get.mockResolvedValueOnce({ data: [{ id: 9, name: 'Basement' }] });
    await venuesApi.list();
    expect(get).toHaveBeenCalledWith('/l/pool/venues');
    expect(venuesApi.peek()).toEqual([{ id: 9, name: 'Basement' }]);
  });

  test('switching accounts drops the previous account\'s rosters', async () => {
    setRosterOwner(1);
    get.mockResolvedValueOnce({ data: [ALICE] });
    await usersApi.list();

    setRosterOwner(1); // same account: keep
    expect(usersApi.peek()).toEqual([ALICE]);

    setRosterOwner(2); // different account: clear
    expect(usersApi.peek()).toBeNull();
    expect(localStorage.getItem('c249:roster:users:pool')).toBeNull();
  });

  test('clearRosterCache wipes memory and storage', async () => {
    get.mockResolvedValueOnce({ data: [ALICE] });
    await usersApi.list();
    clearRosterCache();
    expect(usersApi.peek()).toBeNull();
    expect(localStorage.getItem('c249:roster:users:pool')).toBeNull();
  });

  test('prefetch skips lists that were just fetched', async () => {
    get.mockResolvedValue({ data: [ALICE] });
    await usersApi.list();
    prefetchRoster('pool');
    // users is fresh → only venues is requested
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/l/pool/users', '/l/pool/venues']);
  });
});
