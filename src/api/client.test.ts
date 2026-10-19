import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, JellyfinApi } from './client';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body = '', statusText = '') =>
  vi.fn(async () => new Response(status === 204 ? null : body, { status, statusText }));

describe('buildQuery', () => {
  it('leaves out empty values and joins lists', () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: '', e: ['x', 'y'], f: [], g: false })).toBe('?a=1&e=x%2Cy&g=false');
    expect(buildQuery({})).toBe('');
    expect(buildQuery()).toBe('');
  });
});

describe('JellyfinApi', () => {
  it('builds URLs under the server address, with or without a trailing slash', () => {
    const api = new JellyfinApi('/jellyfin/', 'tok', 'user');
    expect(api.url('Items')).toBe('/jellyfin/Items');
    expect(api.url('/Items', { limit: 5 })).toBe('/jellyfin/Items?limit=5');
  });

  it('only puts the token in the URL when asked to (media elements)', () => {
    const api = new JellyfinApi('http://host:8096', 'tok');
    expect(api.url('/Videos/1/stream', { static: true })).not.toContain('tok');
    expect(api.url('/Videos/1/stream', { static: true }, true)).toBe('http://host:8096/Videos/1/stream?static=true&ApiKey=tok');
  });

  it('identifies itself and sends the token in the Authorization header', () => {
    const header = new JellyfinApi('', 'tok').authorizationHeader();
    expect(header).toMatch(/^MediaBrowser Client="Jellyfied", Device="[^"]*", DeviceId="[^"]+", Version="[^"]+", Token="tok"$/);
    expect(new JellyfinApi('').authorizationHeader()).not.toContain('Token=');
  });

  it('parses JSON and treats an empty answer as nothing', async () => {
    const api = new JellyfinApi('/jellyfin', 'tok');
    vi.stubGlobal('fetch', respond(200, '{"Name":"x"}'));
    await expect(api.get('/Items/1')).resolves.toEqual({ Name: 'x' });
    vi.stubGlobal('fetch', respond(204));
    await expect(api.post('/Sessions/Logout')).resolves.toBeUndefined();
  });

  it('sends JSON bodies and the query string', async () => {
    const fetchMock = respond(200, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await new JellyfinApi('/jellyfin', 'tok').post('/Users/Configuration', { a: 1 }, { userId: 'u' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/jellyfin/Users/Configuration?userId=u');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('signs the user out when the session is rejected', async () => {
    const api = new JellyfinApi('/jellyfin', 'tok');
    api.onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', respond(401));
    await expect(api.get('/Users/Me')).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired or the credentials are invalid.',
    });
    expect(api.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not sign anyone out for a failed login', async () => {
    const api = new JellyfinApi('/jellyfin');
    api.onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', respond(401));
    await expect(api.post('/Users/AuthenticateByName', {})).rejects.toBeInstanceOf(ApiError);
    expect(api.onUnauthorized).not.toHaveBeenCalled();
  });

  it('uses the server’s own error message when there is one', async () => {
    vi.stubGlobal('fetch', respond(400, '{"title":"Name is required"}'));
    await expect(new JellyfinApi('', 'tok').post('/Collections')).rejects.toMatchObject({ status: 400, message: 'Name is required' });
  });

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(new JellyfinApi('', 'tok').get('/System/Info')).rejects.toMatchObject({ status: 0 });
  });
});
