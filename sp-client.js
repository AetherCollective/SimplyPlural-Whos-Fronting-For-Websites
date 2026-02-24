(() => {
const RELAY_URL = 'wss://YOUR_RELAY_IP/api/socket/websocket';

function timeSince(date) {
const seconds = Math.floor((new Date() - date) / 1000);
const intervals = [
{ label: 'year', secs: 31536000 },
{ label: 'month', secs: 2592000 },
{ label: 'day', secs: 86400 },
{ label: 'hour', secs: 3600 },
{ label: 'minute', secs: 60 },
{ label: 'second', secs: 1 },
];
for (const { label, secs } of intervals) {
const count = Math.floor(seconds / secs);
if (count >= 1) return `${count} ${label}${count !== 1 ? 's' : ''}`;
}
return 'just now';
}

let socket = null;
let ready = false;
const listeners = {};
const pendingHistoryRequests = new Set();

function on(type, cb) {
if (!listeners[type]) listeners[type] = [];
listeners[type].push(cb);
}

function sendMsg(msg) {
if (ready) socket.send(JSON.stringify(msg));
}

function flushHistoryRequests() {
for (const memberId of pendingHistoryRequests)
socket.send(JSON.stringify({ type: 'get_fronthistory', memberId }));
}

function connect() {
socket = new WebSocket(RELAY_URL);
socket.addEventListener('open', () => { ready = true; flushHistoryRequests(); });
socket.addEventListener('message', ({ data }) => {
try {
const msg = JSON.parse(data);
(listeners[msg.type] || []).forEach(cb => cb(msg));
} catch { }
});
socket.addEventListener('close', () => { ready = false; setTimeout(connect, 5000); });
socket.addEventListener('error', () => { });
}

connect();

window.getCurrentFronters = function (elementId) {
const el = document.getElementById(elementId);
if (!el) return;
on('fronters', ({ data: members }) => {
if (!members.length) {
el.innerHTML = '<span class="p"><strong>No one is currently fronting.</strong></span>';
return;
}
const names = members.map(({ name, color, status }) =>
`<a href="#${name}" style="color:${color};text-decoration:none;">${name}${status ? ` <em>(${status})</em>` : ''}</a>`
).join(', ');
el.innerHTML = `<span class="p"><strong>Currently Fronting:</strong> ${names}</span>`;
});
};

window.getLastFrontedDateTime = function (elementId, memberId) {
let tickInterval = null;
let lastData = null;
let rendered = false;

const render = (isLive, endTime) => {
const el = document.getElementById(elementId);
if (!el) return false;
if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
if (isLive) {
el.innerHTML = '<span class="p"><strong>Last Fronted: &nbsp;<rainbow class="pulse">Actively Fronting Now!</rainbow></strong></span>';
} else if (endTime > 0) {
const update = () => { el.innerHTML = `<span class="p"><strong>Last Fronted: </strong>${timeSince(new Date(endTime))} ago</span>`; };
update();
tickInterval = setInterval(update, 1000);
} else {
el.innerHTML = '<span class="p"><strong>Last Fronted: </strong>No history found.</span>';
}
return true;
};

const tryRender = () => {
if (!lastData) return;
let latestEndTime = 0, isLive = false;
lastData.forEach(({ content }) => {
if (!content) return;
if (content.live) isLive = true;
if (content.endTime > latestEndTime) latestEndTime = content.endTime;
});
rendered = render(isLive, latestEndTime);
};

on('fronthistory', (msg) => {
if (msg.memberId !== memberId) return;
lastData = msg.data;
rendered = false;
tryRender();
});

pendingHistoryRequests.add(memberId);
if (ready) sendMsg({ type: 'get_fronthistory', memberId });

const poll = setInterval(() => {
if (rendered) { clearInterval(poll); return; }
tryRender();
}, 300);
};

})();