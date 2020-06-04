console.log('hi from client.js');

// utils

function generateCode(len) {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	return [...Array(len)].map(() => chars[Math.floor(Math.random()*26)]).join('');
}

// global state

let State = {
	mode: 'splash',
	name: 'anon-' + generateCode(4),
	lobby: '',
	status: 'ok',
};

// state convenience functions

function teamMembers(team) {
	return Object.keys(State.members).filter(mId => State.members[mId].team === team);
} 

function teamMemberNames(team) {
	return teamMembers(team).map(mId => State.members[mId].name);
}

function isMyTurn() {
	return State.turn === State.members[State.mId].team;
}

function stateBoundInput(fieldName, style, cb) {
	return m('input', { 
		style,
		value: State[fieldName], 
		oninput: e => {
			State[fieldName] = e.target.value;
			if (cb) cb(e.target.value);
		},
	});
}

function revealedClues() {
	return State.clues.slice(0, State.numRevealed);
}

function voteList(yesorno) {
	return Object.keys(State.votes).filter(mId => State.votes[mId] === yesorno);
}

function buzzerWasMe() {
	return State.buzzed === State.mId;
}

function iVoted() {
	return State.votes[State.mId] !== undefined;
}

function votingFinished() {
	return State.voteResult !== null;
}

function timeRemaining() {
	const { startTime, endTime } = State;
	const now = Date.now();
	const pct = (now - startTime) / (endTime - startTime);
	const sLen = 20;
	let s = '[';
	// console.log('pct:', pct);
	const nLeading = Math.round(pct*sLen);
	s += '='.repeat(nLeading);
	s += ' '.repeat(Math.max(0, sLen-nLeading));
	s += '] ' + Math.floor((endTime-now)/1000);
	return m('span', { style: { whiteSpace: 'pre', fontFamily: 'monospace' } }, s);
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

socket.on('flash', ({ winner }) => {
	State.guess = '';
	m.redraw();
	const color = winner === State.members[State.mId].team ? 'green' : 'red';
	console.log('flashing', color);
	document.body.classList.add('flash-'+color);
	setTimeout(() => {
		document.body.classList.remove('flash-'+color);
	}, 500);
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

const Buzzer = {
	voteEls(yesorno) {
		return m('ul', voteList(yesorno).map(mId => m('li', State.members[mId].name)));
	},
	view() {
		if (State.buzzed) {
			const els = [];
			els.push(m('p', (buzzerWasMe() ? 'you' : State.members[State.buzzed].name) + ' buzzed in'));
			if (!buzzerWasMe() || votingFinished()) {
				els.push(m('p', 'correct answer: ' + State.answer));
			}
			if (buzzerWasMe() || iVoted()) {
				els.push(m('p', 'yes:'));
			} else {
				els.push(emitterButton('vote yes', 'vote', 'yes'));
			}
			els.push(this.voteEls('yes'));
			if (buzzerWasMe() || iVoted()) {
				els.push(m('p', 'no:'));
			} else {
				els.push(emitterButton('vote no', 'vote', 'no'));
			}
			els.push(this.voteEls('no'));
			if (votingFinished()) {
				els.push(m('p', 'voting result: ' + State.voteResult));
				els.push(m('p', 'points awarded: ' + State.pointsAwarded));
			}
			return m('div', els);
		} else {
			const els = [];
			els.push(m('p', timeRemaining()));
			if (isMyTurn()) {
				if ((State.round === 1 && State.numRevealed < 4) || (State.round === 2 && State.numRevealed < 3)) {
					els.push(emitterButton('reveal next', 'reveal'));
				}
				els.push(' ');
				els.push(emitterButton('BUZZ', 'buzz'));
			} else {
				els.push(m('p', 'not your turn'));
			}
			return m('div', els);
		}
	},
};

// update timer
setInterval(() => {
	m.redraw();
}, 100);

const Round1 = {
	view() {
		return m('div', [
			m('p', 'clues:'),
			m('ul', revealedClues().map(clue => m('li', clue))),
			m(Buzzer),
		]);
	},
};

const Round2 = {
	view() {
		return m('div', [
			m('p', 'clues:'),
			m('ul', revealedClues().map(clue => m('li', clue))),
			m(Buzzer),
		]);
	},
};

let emittedGuess = null;
const Round4 = {
	view() {
		const currentClue = State.clues[State.numRevealed - 1];
		return m('div', [
			m('h2', State.category),
			m('p', { style: { fontSize: '3em' } }, currentClue),
			stateBoundInput('guess', { 
				fontSize: '3em', 
				textTransform: 'uppercase' ,
			}, guess => {
				if (guess.toUpperCase() === State.answer && emittedGuess !== State.answer) {
					emit('correct-guess');
					emittedGuess = State.answer;
				}
			}),
			m('p', timeRemaining()),
			m('ul', State.prevAnswers.map(a => m('li', a))),
		]);
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
			m('h4', State.epMeta + ' round ' + State.round + ' question ' + (State.question+1) + '/' + State.numQs),
			m(roundMap[State.round]),
			m('img', {
				style: { position: 'absolute', top: '0px', right: '0px', minWidth: '10%', maxWidth: '40%' },
				src: '/victorias/' + State.whichVictoria + '.jpg',
			}),
		]);
	},
};

const Finished = {
	view() {
		return m('div', [
			m('p', 'The game is over!'),
			m('p', 'Team 1 (' + teamMemberNames(0).join(', ') + ') scored ' + State.points[0] + ' points.'),
			m('p', 'Team 2 (' + teamMemberNames(1).join(', ') + ') scored ' + State.points[1] + ' points.'),
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

m.mount(document.getElementById('root'), {
	view() {
		return m('div', { 
			style: { transition: 'background-color 0.5s ease-out' },
		}, [
			m('h1', 'only connect!!'),
			m('span', 'status: ' + State.status),
			m(modeMap[State.mode]),
		]);
	},
});

