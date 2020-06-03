console.log('hi from client.js');

// utils

function generateCode(len) {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	return [...Array(len)].map(() => chars[Math.floor(Math.random()*26)]).join('');
}

// global state

let State = {
	mode: 'splash',
	name: 'player-' + generateCode(4),
	lobby: '',
	status: 'ok',
};

function teamMembers(team) {
	return Object.keys(State.members).filter(mId => State.members[mId].team === team);
} 

function teamMemberNames(team) {
	return teamMembers(team).map(mId => State.members[mId].name);
}

function stateBoundInput(fieldName) {
	return m('input', { 
		value: State[fieldName], 
		oninput: e => State[fieldName] = e.target.value,
	});
}

// socket.io

const socket = io();

socket.on('connect', () => {
	console.log('connected to socket.io server');
});

function emit(eventName, key) {
	console.log('emitting', eventName);
	socket.emit(eventName, { key, state: State });
}

function emitterButton(labelText, eventName, key, style) {
	return m('button', { onclick: () => emit(eventName, key), style }, labelText);
}

function emitterLink(labelText, eventName, key, style) {
	return m('a', { href: 'javascript:void(0)', onclick: () => emit(eventName, key), style }, labelText);
}

socket.on('update-state', newState => {
	console.log('updating state with', newState);
	State = Object.assign({}, State, newState);
	m.redraw();
});

// components

const Splash = {
	view() {
		return m('div', [
			m('p', m('span', 'name: '), stateBoundInput('name')),
			m('p', emitterButton('create new lobby', 'create-lobby')),
			m('p', stateBoundInput('lobby'), emitterButton('join lobby', 'join-lobby')),
		]);
	},
};

const Lobby = {
	teamMembers(team) {
		return Object.keys(State.members || {})
			.filter(mId => State.members[mId].team === team)
			.map(mId => m('li', [
				m('span', State.members[mId].name + ' '), 
				emitterButton(State.members[mId].team === 0 ? 'v' : '^', 'switch-team', mId),
			]));
	},
	view() {
		const team1 = Object.values(State.members || {})
		return m('div', [
			m('p', 'name: ' + State.name),
			m('p', 'lobby: ' + State.lobby.toUpperCase()),
			emitterButton('START', 'start-game'),
			m('p', 'team 1:'),
			m('ul', this.teamMembers(0)),
			m('p', 'team 2:'),
			m('ul', this.teamMembers(1)),
			m('p', 'episodes:'),
			m('ul', (State.episodes || []).map((ep, idx) => {
				const isSelected = idx === State.selectedEpisode;
				const style = isSelected ? {
					color: 'blue',
					fontWeight: 'bold',
				} : {
					color: 'black',
					fontWeight: 'normal',
				};
				return m('li', emitterLink(ep, 'select-episode', idx, style));
			})),
		]);
	},
};

function isMyTurn() {
	return State.turn === State.members[State.mId].team;
}

const Buzzer = {
	voteList(yesorno) {
		return m('ul', Object.keys(State.votes)
			.filter(mId => State.votes[mId] === yesorno)
			.map(mId => m('li', State.members[mId].name)));
	},
	buzzerWasMe() {
		return State.buzzed === State.mId;
	},
	timeRemaining() {
		const { startTime } = State;
		const elapsed = Date.now() - startTime;
		return 40 - elapsed / 1000;
	},
	view() {
		if (State.buzzed) {
			const els = [];
			els.push(m('p', (this.buzzerWasMe() ? 'you' : State.members[State.buzzed].name) + ' buzzed in'));
			if (this.buzzerWasMe()) {
				els.push(m('p', 'yes:'));
			} else {
				els.push(m('p', 'correct answer: ' + State.answer));
				els.push(emitterButton('vote yes', 'vote', 'yes'));
			}
			els.push(this.voteList('yes'));
			if (this.buzzerWasMe()) {
				els.push(m('p', 'no:'));
			} else {
				els.push(emitterButton('vote no', 'vote', 'no'));
			}
			els.push(this.voteList('no'));
			if (State.voteResult) {
				els.push(m('p', 'voting result: ' + State.voteResult));
				els.push(m('p', 'points awarded: ' + State.pointsAwarded));
			}
			return m('div', els);
		} else {
			if (isMyTurn()) {
				const els = [];
				els.push(m('p', 'time remaining: ' + Math.floor(this.timeRemaining())));
				if (State.numRevealed < 4) {
					els.push(emitterButton('reveal next', 'reveal'));
				}
				els.push(' ');
				els.push(emitterButton('BUZZ', 'buzz'));
				return m('div', els);
			} else {
				return m('p', 'not your turn');
			}
		}
	},
};

// update timer
let autobuzzed = null;
setInterval(() => {
	m.redraw();
	/*
	if (autobuzzed !== State.question && Buzzer.timeRemaining() < 0) {
		emit('buzz');
		autobuzzed = State.question;
	}
*/
}, 100);

const Round1 = {
	view() {
		return m('div', [
			m('p', 'clues:'),
			m('ul', State.clues.slice(0, State.numRevealed).map(clue => m('li', clue))),
			m(Buzzer),
		]);
	},
};

const Round2 = {
	view() {
		return m('div', 'round two');
	},
};

const Round4 = {
	view() {
		return m('div', 'round four');
	},
};

const roundMap = {
	1: Round1,
	2: Round2,
	4: Round4,
};

const Game = {
	view() {
		return m('div', [
			m('h3', 'team 1 (' + teamMemberNames(0).join(', ') + '): ' + State.points[0]),
			m('h3', 'team 2 (' + teamMemberNames(1).join(', ') + '): ' + State.points[1]),
			m('h4', State.epMeta + ' round ' + State.round + ' question ' + State.question + '/' + State.numQs),
			m(roundMap[State.round]),
		]);
	},
};

const Finished = {
	view() {
		return m('div', [
			m('p', 'The game is over!'),
			m('p', 'Team 1 scored ' + State.points[0] + ' points.'),
			m('p', 'Team 2 scored ' + State.points[1] + ' points.'),
			emitterButton('return to lobby', 'return-to-lobby'),
		]);
	},
};

const modeMap = {
	splash: Splash,
	lobby: Lobby,
	game: Game,
	finished: Finished,
};

m.mount(document.body, {
	view() {
		return m('div', [
			m('h1', 'only connect!!'),
			m('span', 'status: ' + State.status),
			m(modeMap[State.mode]),
		]);
	},
});

