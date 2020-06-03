console.log('hi from app');

// webrtc

const iceServers = [{ 
	urls: 'stun:stun.l.google.com:19302'
}, { 
	urls: 'turn:turn.rje.li', 
	username: 'onlyconnect',
	credential: 'e84349c6-03d0-4ecb-8827-415d2745249e'
}];

const pc = new RTCPeerConnection({ iceServers });

pc.onicecandidate = evt => {
	console.log('got ice candidate:', evt);
};

pc.onnegotationneeded = evt => {
	console.log('negotation needed:', evt);
};

pc.ondatachannel = evt => {
	console.log('got data channel:', evt);
};

const dc = pc.createDataChannel('dc');
console.log('created dc:', dc);

dc.onopen = evt => console.log('dc opened:', evt);
dc.onclose = evt => console.log('dc closed:', evt);
dc.onmessage = evt => console.log('dc msg:', evt);

// socketio

const socket = io('http://rooms.rje.li');

socket.on('connect', () => {
	console.log('connected to rooms.rje.li');
});

socket.on('announcement', data => {
	console.log('got announcement:', data);
});

// socket.emit('join', 'abcd');
// socket.emit('announce', { room: 'abcd', data: 'foo bar baz' });

function generateCode() {
	const chars = "abcdefghijklmnopqrstuvwxyz";
}

let lobbyName = '';

function createLobby() {
	console.log('creating lobby');
}

function joinLobby() {
	console.log('joining lobby', lobbyName);
}

const Splash = {
	view() {
		return m('div', [
			m('p', m('button', { onclick: createLobby }, 'host new game')),
			m('p', [
				m('input', { value: lobbyName, oninput: e => lobbyName = e.target.value }), 
				m('button', { onclick: joinLobby }, 'join lobby'),
			]),
		]);
	},
};

m.mount(document.body, {
	view() {
		return m('div', [
			m('h1', 'only connect!!'),
			m(Splash),
		]);
	},
});
