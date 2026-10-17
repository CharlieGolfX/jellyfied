/**
 * "What shall we watch?" for SyncPlay groups: suggestions, votes, a ready check and a wheel that
 * picks the winner. Jellyfin has nowhere for the members of a group to share such things, so
 * Jellyfied's own container keeps them, in nginx's memory (njs), for as long as the group lasts.
 *
 * Every request is checked against Jellyfin itself: the caller's token has to belong to a user who
 * is in the group. Each user only ever writes their own record, so people voting at the same time
 * never undo each other; the few things the group shares (who made it, each spin, who starts the
 * winner) are written with "add", which only the first caller gets to do.
 *
 * The same file runs in nginx (see the default export), in the dev server and in the tests, which
 * give `handle` their own store and their own way of asking Jellyfin.
 */

const MAX_PER_USER = 10;
const MAX_SUGGESTIONS = 30;
const TYPES = ['Movie', 'Series', 'Episode'];
const ID = /^[0-9a-f]{32}$/;

const normId = (id) =>
  String(id || '')
    .replace(/-/g, '')
    .toLowerCase();

function readJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

/** Everything known about one group, read from the store. */
function load(store, gid) {
  const prefix = gid + '|';
  const users = [];
  const spins = [];
  for (const key of store.keys()) {
    if (key.indexOf(prefix) !== 0) continue;
    const rest = key.slice(prefix.length);
    if (rest.indexOf('u|') === 0) {
      const u = readJson(store.get(key), null);
      if (u) users.push(u);
    } else if (rest.indexOf('spin|') === 0) {
      const s = readJson(store.get(key), null);
      if (s) spins.push(s);
    }
  }
  spins.sort((a, b) => a.round - b.round);
  // The round is the first one nobody has spun yet.
  let round = 0;
  while (spins.some((s) => s.round === round)) round++;
  return { users, spins, round, creator: store.get(prefix + 'creator') || null };
}

/** The open suggestions: everyone's, minus what an earlier spin already picked. */
function suggestions(state) {
  const won = state.spins.map((s) => s.winner);
  const list = [];
  for (const u of state.users) {
    for (const s of u.s || []) {
      if (won.indexOf(s.id) >= 0 || list.some((x) => x.id === s.id)) continue;
      const voters = state.users.filter((v) => v.id !== u.id && (v.v || []).indexOf(s.id) >= 0).map((v) => v.name);
      list.push({ id: s.id, by: u.name, byId: u.id, at: s.at, votes: voters.length, voters });
    }
  }
  list.sort((a, b) => a.at - b.at);
  return list;
}

/** The member who may spin the wheel by hand: whoever made the group, or else the longest there. */
function host(state, participants) {
  return state.creator && participants.indexOf(state.creator) >= 0 ? state.creator : participants[0] || null;
}

/** Picks the winner: a suggestion's chance is its votes plus one, so one without votes can still win. */
function spin(store, gid, state, list, by, now, random) {
  const entries = list.map((s) => ({ id: s.id, weight: s.votes + 1 }));
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let point = random() * total;
  let winner = entries[entries.length - 1].id;
  for (const e of entries) {
    if (point < e.weight) {
      winner = e.id;
      break;
    }
    point -= e.weight;
  }
  const record = { round: state.round, at: now, by, winner, entries, offset: 0.15 + random() * 0.7, turns: 6 };
  // Several members can find everyone ready at the same moment: only one spin per round counts.
  store.add(gid + '|spin|' + state.round, JSON.stringify(record));
  return load(store, gid);
}

/** A refusal: `code` names it for the app, which has it translated; `error` is for people reading logs. */
function fail(status, code, error) {
  return { status, body: { code, error } };
}

/**
 * Answers one request. `jellyfin` asks the server as the caller: me() is their user, group(id) the
 * SyncPlay group as they see it, item(id) a library item. Each resolves to null when there is none.
 */
async function handle(opts) {
  const store = opts.store;
  const jellyfin = opts.jellyfin;
  const now = opts.now !== undefined ? opts.now : Date.now();
  const random = opts.random || Math.random;
  const gid = normId(opts.groupId);
  if (!ID.test(gid)) return fail(404, 'noGroup', 'No such group');

  const me = await jellyfin.me();
  if (!me || !me.Id) return fail(401, 'notSignedIn', 'Not signed in');
  const group = await jellyfin.group(gid);
  const participants = [];
  for (const name of (group && group.Participants) || []) if (participants.indexOf(name) < 0) participants.push(name);
  if (participants.indexOf(me.Name) < 0) return fail(403, 'notMember', 'Not in this group');

  const myKey = gid + '|u|' + normId(me.Id);
  let state = load(store, gid);
  const mine = state.users.find((u) => u.id === normId(me.Id)) || { id: normId(me.Id), name: me.Name, s: [], v: [], r: -1 };
  mine.name = me.Name;
  const save = () => {
    store.set(myKey, JSON.stringify(mine));
    state = load(store, gid);
  };
  let extra = {};

  if (opts.method === 'POST') {
    const body = opts.body || {};
    const itemId = normId(body.itemId);
    const open = suggestions(state);
    switch (body.action) {
      case 'claim':
        // Only while alone in it, which is the case right after creating the group.
        if (participants.length !== 1) return fail(409, 'notAlone', 'Only the creator can claim a group');
        store.add(gid + '|creator', me.Name);
        state = load(store, gid);
        break;
      case 'suggest': {
        if (!ID.test(itemId)) return fail(400, 'notAnItem', 'Not an item');
        if (open.some((s) => s.id === itemId)) return fail(409, 'alreadySuggested', 'Already suggested');
        if (open.length >= MAX_SUGGESTIONS) return fail(409, 'tooMany', 'Too many suggestions');
        if (mine.s.filter((s) => open.some((o) => o.id === s.id)).length >= MAX_PER_USER)
          return fail(409, 'tooMany', 'Too many suggestions');
        const item = await jellyfin.item(itemId);
        if (!item || TYPES.indexOf(item.Type) < 0) return fail(400, 'wrongType', 'Only films, shows and episodes can be suggested');
        mine.s = mine.s.filter((s) => s.id !== itemId).concat([{ id: itemId, at: now }]);
        save();
        break;
      }
      case 'unsuggest':
        mine.s = mine.s.filter((s) => s.id !== itemId);
        save();
        break;
      case 'vote': {
        const target = open.find((s) => s.id === itemId);
        if (!target) return fail(404, 'noSuggestion', 'No such suggestion');
        if (target.byId === mine.id) return fail(409, 'ownSuggestion', 'You can’t vote for your own suggestion');
        mine.v = mine.v.filter((id) => id !== itemId);
        if (body.on) mine.v.push(itemId);
        save();
        break;
      }
      case 'ready':
        mine.r = body.on ? state.round : -1;
        save();
        break;
      case 'spin': {
        if (host(state, participants) !== me.Name) return fail(403, 'notHost', 'Only the host can spin the wheel');
        if (!open.length) return fail(409, 'empty', 'Nothing to pick from');
        state = spin(store, gid, state, open, me.Name, now, random);
        break;
      }
      case 'start':
        // After the wheel stops, every member asks; the first one starts the winner for the group.
        extra = { go: store.add(gid + '|started|' + Number(body.round), me.Name) };
        break;
      default:
        return fail(400, 'unknownAction', 'Unknown action');
    }
  }

  // Once everyone in the group is ready, the wheel spins by itself.
  const ready = (name) => state.users.some((u) => u.name === name && u.r === state.round);
  if (suggestions(state).length && participants.every(ready)) {
    state = spin(store, gid, state, suggestions(state), null, now, random);
  }

  const open = suggestions(state);
  const last = state.spins.length ? state.spins[state.spins.length - 1] : null;
  const myVotes = (state.users.find((u) => u.id === mine.id) || mine).v || [];
  return {
    status: 200,
    body: Object.assign(
      {
        now,
        round: state.round,
        me: me.Name,
        host: host(state, participants),
        claimed: Boolean(state.creator),
        participants: participants.map((name) => ({ name, ready: ready(name) })),
        suggestions: open.map((s) => ({
          id: s.id,
          by: s.by,
          votes: s.votes,
          voters: s.voters,
          mine: s.byId === mine.id,
          voted: myVotes.indexOf(s.id) >= 0,
        })),
        spin: last,
      },
      extra,
    ),
  };
}

// ---- nginx -----------------------------------------------------------------

/** Asks Jellyfin through the internal location the container sets up, with the caller's own headers. */
async function ask(r, path) {
  const reply = await r.subrequest('/_jellyfied_jellyfin' + path, { method: 'GET' });
  return reply.status === 200 ? readJson(reply.responseText, null) : null;
}

async function serve(r) {
  const m = /\/jellyfied-api\/syncplay\/([^/?]+)$/.exec(r.uri);
  const dict = ngx.shared.jellyfied_syncplay;
  const store = {
    get: (k) => dict.get(k),
    set: (k, v) => dict.set(k, v),
    add: (k, v) => dict.add(k, v),
    keys: () => dict.keys(100000),
  };
  let result;
  if (r.method !== 'GET' && r.method !== 'POST') result = fail(405, 'method', 'GET or POST');
  else {
    try {
      result = await handle({
        store,
        method: r.method,
        groupId: m ? m[1] : '',
        body: r.method === 'POST' ? readJson(r.requestText, {}) : null,
        jellyfin: {
          me: () => ask(r, '/Users/Me'),
          group: (id) => ask(r, '/SyncPlay/' + id),
          item: (id) => ask(r, '/Items/' + id),
        },
      });
    } catch (e) {
      r.error('syncplay picker: ' + e);
      result = fail(500, 'failed', 'Something went wrong');
    }
  }
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(result.status, JSON.stringify(result.body));
}

export default { handle, serve };
