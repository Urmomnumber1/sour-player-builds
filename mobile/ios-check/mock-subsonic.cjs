// Tiny fake OpenSubsonic server for clicking through a Sour Player web build locally.
// Songs are generated beats (WAV) so the visualizers have real audio to react to.
const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4533);
// LONG=1: real-world long names (phone layout tests)
const LONG = process.env.LONG === '1';
const longName = (base, extra) => (LONG ? `${base} ${extra}` : base);
const ARTISTS = ['Lemon Drop', 'Citrus Club', 'Night Juice', 'Pulp Fiction Band', 'Zest Boys', 'Sour Patch'];
const GENRES = ['Pop', 'Hip-Hop', 'Electronic', 'Rock', 'R&B', 'Jazz'];
const COLORS = ['#F2C14E', '#7BC67E', '#E86A92', '#6CA0DC', '#B48EF0', '#D85A30', '#1D9E75', '#378ADD', '#993556', '#BA7517', '#534AB7', '#639922'];
const now = new Date('2026-09-01T12:00:00Z').toISOString();

const artists = ARTISTS.map((name, i) => ({ id: `ar${i}`, name }));
const albums = [];
const songs = [];
for (let a = 0; a < 12; a++) {
    const artist = artists[a % artists.length];
    const id = `al${a}`;
    const year = 1985 + a * 3;
    const album = {
        album: longName(`Album ${a + 1}`, '(Original Motion Picture Soundtrack) [Deluxe Edition]'),
        artist: artist.name,
        artistId: artist.id,
        artists: [artist],
        coverArt: id,
        created: now,
        duration: 0,
        genre: GENRES[a % GENRES.length],
        genres: [{ name: GENRES[a % GENRES.length] }],
        id,
        isDir: true,
        isVideo: false,
        name: longName(`Album ${a + 1}`, '(Original Motion Picture Soundtrack) [Deluxe Edition]'),
        parent: artist.id,
        song: [],
        songCount: 0,
        title: longName(`Album ${a + 1}`, '(Original Motion Picture Soundtrack) [Deluxe Edition]'),
        year,
    };
    for (let t = 0; t < 5; t++) {
        const n = songs.length;
        const song = {
            album: album.name,
            albumArtists: [artist],
            albumId: id,
            artist: artist.name,
            artistId: artist.id,
            artists: [artist],
            bitRate: 320,
            bpm: 90 + ((n * 7) % 70),
            contentType: 'audio/wav',
            coverArt: id,
            created: now,
            discNumber: 1,
            duration: 40,
            genre: album.genre,
            genres: album.genres,
            id: `so${n}`,
            isDir: false,
            isVideo: false,
            parent: id,
            path: `${artist.name}/${album.name}/${t + 1} Song ${n + 1}.wav`,
            playCount: (n * 13) % 40,
            size: 1000000,
            suffix: 'wav',
            title: longName(`Song ${n + 1}`, '(Flower Man) (feat. Clint Ahn and the Lemon Drop Orchestra)'),
            track: t + 1,
            type: 'music',
            year,
        };
        songs.push(song);
        album.song.push(song);
    }
    album.songCount = album.song.length;
    album.duration = album.song.reduce((s, x) => s + x.duration, 0);
    albums.push(album);
}
const playlists = [
    { id: 'pl0', name: 'Late night drive', songs: songs.slice(0, 12) },
    { id: 'pl1', name: 'Gym hype', songs: songs.slice(20, 30) },
];
const starred = new Set(['so1', 'so4', 'al2']);
const ratings = {};

const strip = ({ song, ...rest }) => rest;
const withStar = (x) => ({ ...x, starred: starred.has(x.id) ? now : undefined, userRating: ratings[x.id] });
const playlistJson = (p, full) => ({
    changed: now,
    comment: '',
    coverArt: p.songs[0]?.coverArt,
    created: now,
    duration: p.songs.reduce((s, x) => s + x.duration, 0),
    entry: full ? p.songs.map(withStar) : undefined,
    id: p.id,
    name: p.name,
    owner: 'tester',
    public: true,
    songCount: p.songs.length,
});

function lyrics(song) {
    const words = ['and the lemons fall', 'sour on the tongue', 'we keep it playing loud', 'friends in the room', 'one more song tonight', 'turn it up again', 'citrus in the air', 'never stop the beat'];
    const line = [];
    for (let i = 0; i < 16; i++) line.push({ start: i * 2500, value: words[(i + song.track) % words.length] });
    return { lang: 'eng', line, synced: true };
}

function wav(seed, bpm) {
    const rate = 22050;
    const secs = 40;
    const n = rate * secs;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(n * 2, 40);
    const beat = 60 / bpm;
    const roots = [220, 247, 262, 294, 330, 349];
    const root = roots[seed % roots.length];
    for (let i = 0; i < n; i++) {
        const t = i / rate;
        const bt = t % beat;
        const kick = Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 9);
        const ht = (t + beat / 2) % beat;
        const hat = (Math.random() * 2 - 1) * Math.exp(-ht * 60) * 0.25;
        const bar = Math.floor(t / (beat * 4)) % 4;
        const f = root * [1, 1.25, 1.5, 1.335][bar];
        const pad = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t)) * 0.18;
        const v = Math.max(-1, Math.min(1, kick * 0.8 + hat + pad));
        buf.writeInt16LE(Math.round(v * 30000), 44 + i * 2);
    }
    return buf;
}
const wavCache = new Map();

function cover(id) {
    const i = Number(String(id).replace(/\D/g, '')) || 0;
    const c = COLORS[i % COLORS.length];
    const c2 = COLORS[(i + 5) % COLORS.length];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="${c}"/><circle cx="420" cy="200" r="150" fill="${c2}" opacity=".7"/><text x="40" y="540" font-family="sans-serif" font-size="80" fill="#151515">${id}</text></svg>`;
}

function send(res, status, body, type = 'application/json') {
    res.writeHead(status, {
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': '*',
        'Content-Type': type,
    });
    res.end(body);
}
// test accounts (local testing only): tester and friend, both with the password in test-login.txt
const USERS = ['tester', 'friend', 'gavin'];
const PASS = 'lemon-test-1';
const authed = (q) => {
    const u = (q('u') || '').toLowerCase();
    if (!USERS.includes(u)) return false;
    let p = q('p');
    if (p && p.startsWith('enc:')) p = Buffer.from(p.slice(4), 'hex').toString();
    if (p) return p === PASS;
    const t = q('t');
    const salt = q('s');
    return !!t && !!salt && crypto.createHash('md5').update(PASS + salt).digest('hex') === t;
};
const fail = (res, code, message) =>
    send(res, 200, JSON.stringify({ 'subsonic-response': { error: { code, message }, openSubsonic: true, serverVersion: '0.55.0', status: 'failed', type: 'navidrome', version: '1.16.1' } }));
const ok = (res, extra = {}) =>
    send(res, 200, JSON.stringify({ 'subsonic-response': { openSubsonic: true, serverVersion: '0.55.0', status: 'ok', type: 'navidrome', version: '1.16.1', ...extra } }));

http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    // OpenSubsonic formPost: parameters can come in the body too
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handle(req, res, body));
}).listen(PORT, () => console.log(`mock subsonic on http://localhost:${PORT}`));

function handle(req, res, body) {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (body) for (const [k, v] of new URLSearchParams(body)) u.searchParams.append(k, v);
    const ep = u.pathname.replace(/^\/rest\//, '').replace(/\.view$/, '');
    const q = (k) => u.searchParams.get(k);
    const all = (k) => u.searchParams.getAll(k);
    if (ep !== 'getCoverArt' && ep !== 'stream' && ep !== 'download') {
        if (!q('u')) return fail(res, 10, 'Required parameter is missing');
        if (!authed(q)) return fail(res, 40, 'Wrong username or password');
    }
    try {
        switch (ep) {
            case 'ping':
                return ok(res);
            case 'getUser':
                return ok(res, { user: { adminRole: (q('u') || '').toLowerCase() === 'tester', commentRole: true, coverArtRole: true, downloadRole: true, folder: [1], jukeboxRole: false, playlistRole: true, podcastRole: false, scrobblingEnabled: true, settingsRole: true, shareRole: true, streamRole: true, uploadRole: true, username: q('username') || 'tester' } });
            case 'getOpenSubsonicExtensions':
                return ok(res, { openSubsonicExtensions: [{ name: 'songLyrics', versions: [1] }, { name: 'formPost', versions: [1] }] });
            case 'getLicense':
                return ok(res, { license: { valid: true } });
            case 'getMusicFolders':
                return ok(res, { musicFolders: { musicFolder: [{ id: 1, name: 'Music' }] } });
            case 'getScanStatus':
            case 'startScan':
                return ok(res, { scanStatus: { count: songs.length, scanning: false } });
            case 'getArtists':
            case 'getIndexes': {
                const index = artists.map((a) => ({ name: a.name[0], artist: [{ albumCount: '2', coverArt: `al${artists.indexOf(a)}`, id: a.id, name: a.name }] }));
                return ok(res, { [ep === 'getArtists' ? 'artists' : 'indexes']: { ignoredArticles: '', index } });
            }
            case 'getArtist': {
                const a = artists.find((x) => x.id === q('id')) || artists[0];
                const al = albums.filter((x) => x.artistId === a.id).map((x) => withStar(strip(x)));
                return ok(res, { artist: { album: al, albumCount: String(al.length), coverArt: al[0]?.coverArt, id: a.id, name: a.name } });
            }
            case 'getArtistInfo2':
            case 'getArtistInfo':
                return ok(res, { artistInfo2: { biography: 'A made-up band for testing.', similarArtist: [] } });
            case 'getAlbumInfo2':
                return ok(res, { albumInfo: { notes: 'Test album.' } });
            case 'getAlbumList2':
            case 'getAlbumList': {
                const size = Number(q('size') || 20);
                const offset = Number(q('offset') || 0);
                let list = albums.map((x) => withStar(strip(x)));
                if (q('type') === 'random') list = [...list].sort(() => Math.random() - 0.5);
                if (q('type') === 'starred') list = list.filter((x) => starred.has(x.id));
                if (q('type') === 'byGenre') list = list.filter((x) => x.genre === q('genre'));
                return ok(res, { [ep === 'getAlbumList2' ? 'albumList2' : 'albumList']: { album: list.slice(offset, offset + size) } });
            }
            case 'getAlbum': {
                const a = albums.find((x) => x.id === q('id')) || albums[0];
                return ok(res, { album: { ...withStar(a), song: a.song.map(withStar) } });
            }
            case 'getSong': {
                const s = songs.find((x) => x.id === q('id')) || songs[0];
                return ok(res, { song: withStar(s) });
            }
            case 'getRandomSongs':
            case 'getSongsByGenre': {
                let list = songs.map(withStar);
                if (q('genre')) list = list.filter((x) => x.genre === q('genre'));
                list = [...list].sort(() => Math.random() - 0.5).slice(0, Number(q('size') || q('count') || 10));
                return ok(res, ep === 'getRandomSongs' ? { randomSongs: { song: list } } : { songsByGenre: { song: list } });
            }
            case 'getSimilarSongs':
            case 'getSimilarSongs2':
                return ok(res, { [ep === 'getSimilarSongs2' ? 'similarSongs2' : 'similarSongs']: { song: [...songs].sort(() => Math.random() - 0.5).slice(0, 10).map(withStar) } });
            case 'getTopSongs':
                return ok(res, { topSongs: { song: songs.slice(0, 10).map(withStar) } });
            case 'getGenres':
                return ok(res, { genres: { genre: GENRES.map((g) => ({ albumCount: 2, songCount: 10, value: g })) } });
            case 'search3': {
                const term = (q('query') || '').replace(/"/g, '').toLowerCase();
                const m = (s) => !term || s.toLowerCase().includes(term);
                const ac = Number(q('artistCount') ?? 20);
                const lc = Number(q('albumCount') ?? 20);
                const sc = Number(q('songCount') ?? 20);
                const so = Number(q('songOffset') || 0);
                const lo = Number(q('albumOffset') || 0);
                const ao = Number(q('artistOffset') || 0);
                return ok(res, {
                    searchResult3: {
                        album: albums.filter((x) => m(x.name) || m(x.artist)).slice(lo, lo + lc).map((x) => withStar(strip(x))),
                        artist: artists.filter((x) => m(x.name)).slice(ao, ao + ac).map((a, i) => ({ albumCount: '2', coverArt: `al${i}`, id: a.id, name: a.name })),
                        song: songs.filter((x) => m(x.title) || m(x.artist)).slice(so, so + sc).map(withStar),
                    },
                });
            }
            case 'getPlaylists':
                return ok(res, { playlists: { playlist: playlists.map((p) => playlistJson(p, false)) } });
            case 'getPlaylist': {
                const p = playlists.find((x) => x.id === q('id')) || playlists[0];
                return ok(res, { playlist: playlistJson(p, true) });
            }
            case 'createPlaylist': {
                const p = { id: `pl${playlists.length}`, name: q('name') || 'New playlist', songs: all('songId').map((id) => songs.find((s) => s.id === id)).filter(Boolean) };
                playlists.push(p);
                return ok(res, { playlist: playlistJson(p, true) });
            }
            case 'updatePlaylist': {
                const p = playlists.find((x) => x.id === q('playlistId'));
                if (p) {
                    all('songIdToAdd').forEach((id) => { const s = songs.find((x) => x.id === id); if (s) p.songs.push(s); });
                    const rm = all('songIndexToRemove').map(Number).sort((a, b) => b - a);
                    rm.forEach((i) => p.songs.splice(i, 1));
                    if (q('name')) p.name = q('name');
                }
                return ok(res);
            }
            case 'deletePlaylist':
                return ok(res);
            case 'getStarred':
            case 'getStarred2':
                return ok(res, { [ep === 'getStarred2' ? 'starred2' : 'starred']: { album: albums.filter((x) => starred.has(x.id)).map((x) => withStar(strip(x))), artist: [], song: songs.filter((x) => starred.has(x.id)).map(withStar) } });
            case 'star':
                [...all('id'), ...all('albumId'), ...all('artistId')].forEach((id) => starred.add(id));
                return ok(res);
            case 'unstar':
                [...all('id'), ...all('albumId'), ...all('artistId')].forEach((id) => starred.delete(id));
                return ok(res);
            case 'setRating':
                ratings[q('id')] = Number(q('rating'));
                return ok(res);
            case 'getLyricsBySongId': {
                const s = songs.find((x) => x.id === q('id')) || songs[0];
                return ok(res, { lyricsList: { structuredLyrics: [lyrics(s)] } });
            }
            case 'getLyrics':
                return ok(res, { lyrics: { value: '' } });
            case 'getInternetRadioStations':
                return ok(res, { internetRadioStations: { internetRadioStation: [] } });
            case 'getPlayQueue':
            case 'getPlayQueueByIndex':
                return ok(res, {});
            case 'getNowPlaying':
                return ok(res, { nowPlaying: { entry: [] } });
            case 'getCoverArt':
                return send(res, 200, cover(q('id') || 'x'), 'image/svg+xml');
            case 'stream':
            case 'download': {
                const s = songs.find((x) => x.id === q('id')) || songs[0];
                if (!wavCache.has(s.id)) wavCache.set(s.id, wav(Number(s.id.slice(2)), s.bpm));
                const data = wavCache.get(s.id);
                const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
                const head = { 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/wav' };
                if (range) {
                    const start = Number(range[1]);
                    const end = range[2] ? Number(range[2]) : data.length - 1;
                    res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` });
                    return res.end(data.subarray(start, end + 1));
                }
                res.writeHead(200, { ...head, 'Content-Length': data.length });
                return res.end(data);
            }
            default:
                return ok(res);
        }
    } catch (e) {
        console.error(ep, e);
        return send(res, 500, String(e), 'text/plain');
    }
}
