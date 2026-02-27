/**
 * Simply Plural Relay Server
 *
 * .env:
 *   SP_API_KEY=...
 *   SP_SYSTEM_ID=...
 *   SP_BUCKET=...  (optional)
 *   PORT=3000
 *
 * npm install ws dotenv
 * node relay.js
 */

require('dotenv').config();
const http      = require('http');
const WebSocket = require('ws');

const API_BASE  = 'https://api.apparyllis.com/v1';
const API_KEY   = process.env.SP_API_KEY;
const SYSTEM_ID = process.env.SP_SYSTEM_ID;
const BUCKET    = process.env.SP_BUCKET || null;
const PORT      = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  res.writeHead(404);
  res.end();
});

if (!API_KEY || !SYSTEM_ID) {
  console.error('ERROR: SP_API_KEY and SP_SYSTEM_ID must be set in .env');
  process.exit(1);
}

const spHeaders = { Authorization: API_KEY };

async function fetchMemberDetails(memberId) {
  try {
    let res = await fetch(`${API_BASE}/member/${SYSTEM_ID}/${memberId}`, { headers: spHeaders });
    if (res.status === 404)
      res = await fetch(`${API_BASE}/customFront/${SYSTEM_ID}/${memberId}`, { headers: spHeaders });

    const { content = {} } = await res.json();

    if (BUCKET && !(content.buckets || []).includes(BUCKET)) return null;

    return {
      id:     memberId,
      name:   content.name         || 'Unnamed',
      color:  content.color        || '#999999',
      status: content.customStatus || ''
    };
  } catch { return null; }
}

async function fetchCurrentFronters() {
  try {
    const res  = await fetch(`${API_BASE}/fronters/`, { headers: spHeaders });
    const data = await res.json();

    const fronters = await Promise.all(
      data.map(async ({ content }) => {
        if (!content?.member) return null;
        const member = await fetchMemberDetails(content.member);
        if (!member) return null;
        return { ...member, status: content.customStatus || member.status || '' };
      })
    );

    return fronters.filter(Boolean);
  } catch { return []; }
}

async function fetchFrontHistory(memberId) {
  try {
    const res = await fetch(`${API_BASE}/frontHistory/member/${memberId}`, { headers: spHeaders });
    return await res.json();
  } catch { return []; }
}

const server = http.createServer((req) => {
  console.log(`HTTP request: ${req.method} ${req.url}`);
});
const wss    = new WebSocket.Server({ server, path: '/api/socket/websocket' });

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  for (const client of wss.clients)
    send(client, msg);
}

wss.on('connection', async (ws, req) => {
  console.log(`Client connected on path: ${req.url}`);

  const subscribedMembers = new Set(); 

  ws.on('message', async (raw) => {
    try {
      console.log('Raw message from client:', raw.toString());
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'get_fronthistory' && msg.memberId) {
        subscribedMembers.add(msg.memberId); 
        console.log(`Fetching history for member: ${msg.memberId}`);
        const history = await fetchFrontHistory(msg.memberId);
        console.log(`History records returned: ${history.length}`);
        send(ws, { type: 'fronthistory', memberId: msg.memberId, data: history });
      }
    } catch (e) { console.error('Message handler error:', e.message); }
  });

  ws.on('error', (err) => console.error('Client error:', err.message));
  ws.on('close', (code, reason) => console.log(`Client disconnected: code=${code} reason=${reason.toString() || 'none'}`));

  ws.subscribedMembers = subscribedMembers;

  send(ws, { type: 'fronters', data: await fetchCurrentFronters() });
});

function connectUpstream() {
  const upstream = new WebSocket(API_BASE.replace(/^https/, 'wss') + '/socket');

  upstream.on('open', () => {
    console.log('Connected to Simply Plural');
    upstream.send(JSON.stringify({ op: 'authenticate', token: API_KEY }));
    setInterval(() => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send('ping');
    }, 10000);
  });

  upstream.on('message', async (raw) => {
    const str = raw.toString();
    if (str.trim() === 'pong') return;
    console.log('SP message:', str);
    try {
      const msg = JSON.parse(str);
      if (msg.msg?.toLowerCase() === 'update' && msg.target?.toLowerCase() === 'fronthistory') {
        const frontersPromise = fetchCurrentFronters();

        const historyPromises = [];
        for (const client of wss.clients) {
          if (client.readyState !== WebSocket.OPEN) continue;
          for (const memberId of (client.subscribedMembers || [])) {
            historyPromises.push(
              fetchFrontHistory(memberId).then(history => ({ client, memberId, history }))
            );
          }
        }

        const [fronters, ...historyResults] = await Promise.all([frontersPromise, ...historyPromises]);

        broadcast({ type: 'fronters', data: fronters });
        for (const { client, memberId, history } of historyResults) {
          send(client, { type: 'fronthistory', memberId, data: history });
        }
      }
    } catch { /* ignore */ }
  });

  upstream.on('close', () => {
    console.log('Simply Plural disconnected – reconnecting in 5s');
    setTimeout(connectUpstream, 5000);
  });

  upstream.on('error', (err) => console.error('Simply Plural error:', err.message));
}

connectUpstream();

server.listen(PORT, () => console.log(`Relay running on port ${PORT}`));

function shutdown() {
  console.log('Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
