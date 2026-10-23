/**
 * "How do I compare?" for Your stats. Jellyfin lets no user read another's numbers, so users who
 * choose to take part send a summary of theirs (time watched and listened, films, episodes, songs,
 * and time per genre, for each period of the stats page) to Jellyfied's container, which keeps it
 * under a one-way hash of the user id and only ever answers with statements about the caller:
 * "you watched more Drama than anyone else here", "more film time than 80% of people here". Nobody
 * gets to see another user's numbers, names or titles, and with fewer than `minUsers` people taking
 * part there are no statements at all, since with two even a ranking says too much about the other.
 *
 * Since what is sent can't be checked, someone could send made-up numbers and watch the statements
 * change to work out the others'. Two things make that impractical: a summary can only be replaced
 * every `CHANGE_EVERY` (leaving and joining again included), and numbers are kept rounded down to
 * steps a quarter apart, so the statements can't tell close numbers apart.
 *
 * Every request is checked against Jellyfin itself: the caller's token has to belong to a user.
 * The same file runs in nginx (see the default export), in the dev server and in the tests.
 */

import crypto from 'crypto';

const RANGES = ['7d', '30d', '3m', '6m', '12m'];
const METRICS = ['video', 'music', 'films', 'episodes', 'songs'];
/** A summary older than this is left out of comparisons: its owner hasn't been around. */
const STALE_MS = 7 * 86400000;
/** Below this many seconds a genre isn't something to boast about. */
const GENRE_FLOOR = 600;
const MAX_GENRES = 25;
/** How often a summary can be replaced. The app sends one about once a day. */
const CHANGE_EVERY = 12 * 3600000;
const STEP = Math.log(1.25);

function fail(status, code, error) {
  return { status, body: { code, error } };
}

/** A number as kept: rounded down to the nearest power of 1.25 (1, 2, 3, 4, 5, 6, 7, 9, 12, 15…). */
function num(v) {
  if (typeof v !== 'number' || !isFinite(v) || v < 1) return 0;
  return Math.round(Math.exp(Math.floor(Math.log(v) / STEP + 1e-9) * STEP));
}

/** A summary as sent, cut down to what is kept: known periods, numbers, at most 25 genres. */
function clean(body) {
  const out = {};
  const summaries = (body && body.summaries) || {};
  for (const range of RANGES) {
    const s = summaries[range];
    if (!s || typeof s !== 'object') continue;
    const genres = {};
    const names = Object.keys(s.genres || {}).slice(0, MAX_GENRES);
    for (const name of names) {
      const label = String(name).slice(0, 60);
      if (label) genres[label] = num(s.genres[name]);
    }
    const entry = { genres };
    for (const m of METRICS) entry[m] = num(s[m]);
    out[range] = entry;
  }
  return out;
}

function readJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** What the caller can be told about how they compare, for one period. */
function compare(mine, others) {
  const statements = [];
  for (const metric of METRICS) {
    const value = mine[metric] || 0;
    if (!value) continue;
    const below = others.filter((o) => (o[metric] || 0) < value).length;
    if (below === others.length) statements.push({ type: 'most', metric });
    else if (below / others.length >= 0.5) {
      // In fives, so the share says no more than it has to.
      statements.push({ type: 'more', metric, share: Math.floor(((below / others.length) * 100) / 5) * 5 });
    }
  }
  const genres = Object.keys(mine.genres || {})
    .filter((g) => mine.genres[g] >= GENRE_FLOOR && others.every((o) => ((o.genres || {})[g] || 0) < mine.genres[g]))
    .sort((a, b) => mine.genres[b] - mine.genres[a])
    .slice(0, 3);
  for (const genre of genres) statements.push({ type: 'mostGenre', genre });
  return statements;
}

/**
 * Answers one request. `jellyfin.me()` is the caller's user (null when not signed in); `hash`
 * turns a user id into the key it is kept under. GET (with `range`) says how the caller compares,
 * POST takes their summaries, DELETE forgets them.
 */
async function handle(opts) {
  const store = opts.store;
  const now = opts.now !== undefined ? opts.now : Date.now();
  const minUsers = Math.max(2, opts.minUsers || 3);
  const me = await opts.jellyfin.me();
  if (!me || !me.Id) return fail(401, 'notSignedIn', 'Not signed in');
  const hashed = opts.hash(String(me.Id).replace(/-/g, '').toLowerCase());
  const key = 'u|' + hashed;
  // When the caller's summary last changed; kept when they stop taking part, so leaving and joining
  // again doesn't get around the wait.
  const changedKey = 't|' + hashed;

  if (opts.method === 'DELETE') {
    store.del(key);
    return { status: 200, body: { joined: false } };
  }
  if (opts.method === 'POST') {
    const changed = Number(store.get(changedKey)) || 0;
    // Too soon: what is kept stays, and the caller hears how that compares.
    if (!(now - changed < CHANGE_EVERY)) {
      store.set(key, JSON.stringify({ at: now, s: clean(opts.body) }));
      store.set(changedKey, String(now));
    }
  } else if (opts.method !== 'GET') {
    return fail(405, 'method', 'GET, POST or DELETE');
  }

  const range = RANGES.indexOf(opts.range) >= 0 ? opts.range : '30d';
  const entries = [];
  for (const k of store.keys()) {
    if (k.indexOf('u|') !== 0) continue;
    const e = readJson(store.get(k));
    if (e && e.s && now - e.at <= STALE_MS) entries.push({ key: k, summary: e.s[range] || null });
  }
  const own = entries.find((e) => e.key === key);
  const participants = entries.length;
  if (!own) return { status: 200, body: { joined: false, participants, minUsers } };
  if (participants < minUsers) return { status: 200, body: { joined: true, enough: false, participants, minUsers } };
  const others = entries.filter((e) => e.key !== key).map((e) => e.summary || {});
  return {
    status: 200,
    body: { joined: true, enough: true, participants, minUsers, range, statements: compare(own.summary || {}, others) },
  };
}

// ---- nginx -----------------------------------------------------------------

async function serve(r) {
  const dict = ngx.shared.jellyfied_stats;
  const store = {
    get: (k) => dict.get(k),
    set: (k, v) => dict.set(k, v),
    del: (k) => dict.delete(k),
    keys: () => dict.keys(100000),
  };
  let result;
  try {
    result = await handle({
      store,
      method: r.method,
      range: r.args.range,
      body: r.method === 'POST' ? readJson(r.requestText) : null,
      minUsers: Number(r.variables.jellyfied_stats_min_users) || 3,
      hash: (id) =>
        crypto
          .createHash('sha256')
          .update('jellyfied-stats:' + id)
          .digest('hex'),
      jellyfin: {
        me: async () => {
          const reply = await r.subrequest('/_jellyfied_jellyfin/Users/Me', { method: 'GET' });
          return reply.status === 200 ? readJson(reply.responseText) : null;
        },
      },
    });
  } catch (e) {
    r.error('stats compare: ' + e);
    result = fail(500, 'failed', 'Something went wrong');
  }
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(result.status, JSON.stringify(result.body));
}

export default { handle, serve };
