const fs = require('fs');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = 3000;
const N_VICTORIAS = 10;
// used for testing, should otherwise be 1
const START_ROUND = 1;

app.use(express.static('public'));

function generateCode(len) {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	return [...Array(len)].map(() => chars[Math.floor(Math.random()*26)]).join('');
}

function socketsString(sockets) {
	return [...sockets].map(s => s.id).toString();
}

console.log('loading ocdb.json');
let ocdbJson = JSON.parse(fs.readFileSync(__dirname + '/ocdb.json'));

console.log('processing ocdb.json');
const episodes = {};
for (let q of ocdbJson) {
	if (!episodes.hasOwnProperty(q.ep_meta)) {
		episodes[q.ep_meta] = { rounds: { '1': [], '2': [], '4': [] } };
	}
	const r = episodes[q.ep_meta].rounds[q.round];
	if (q.round === 1 || q.round === 2 || q.round === 4) {
		r.push(q);
	} 
}

function updateState(socket, newState) {
	if (!newState.status) {
		newState.status = 'ok';
	}
	socket.emit('update-state', newState);
}

function updateLobbyState(lobby, newState) {
	if (!newState.status) {
		newState.status = 'ok';
	}
	lobbies[lobby] = Object.assign({}, lobbies[lobby], newState);
	io.to(lobby).emit('update-state', newState);
}

const lobbies = {};
const socketToLobby = new Map();

function newLobby() {
	const lobby = generateCode(4);
	lobbies[lobby] = {
		members: {},
		episodes: Object.keys(episodes).sort(),
		selectedEpisode: 0,
	};
	console.log('lobbies:', lobbies);
	return lobby;
}

function joinLobby(socket, lobby, name) {
	if (!lobbies.hasOwnProperty(lobby)) {
		updateState(socket, { status: 'lobby ' + lobby + ' does not exist' });
		return;
	}
	const { members } = lobbies[lobby];
	members[socket.id] = { name, team: 0 };
	socket.join(lobby);
	socketToLobby.set(socket.id, lobby);
	updateState(socket, { mode: 'lobby', mId: socket.id, lobby })
	console.log('members:', members);
	// send all the lobby data
	updateLobbyState(lobby, lobbies[lobby]);
}

function leaveLobby(socket) {
	const lobby = socketToLobby.get(socket.id);
	const { members } = lobbies[lobby];
	delete members[socket.id];
	if (Object.keys(members).length === 0) {
		console.log('lobby is now empty, removing');
		delete lobbies[lobby];
	} else {
		updateLobbyState(lobby, { members });
	}
}

function setRound(lobby, round) {
	const l = lobbies[lobby];
	const epMeta = l.episodes[l.selectedEpisode];
	l.question = -1;
	l.mode = 'game';
	l.turn = 1;
	// l.points = [0, 0];
	l.prevAnswers = [];
	updateLobbyState(lobby, {
		epMeta,
		round,
		numQs: episodes[epMeta].rounds[round].length,
	});
}

function nextQuestion(lobby) {
	const { mode, epMeta, round, turn, question, points, prevAnswers } = lobbies[lobby];
	let roundData = episodes[epMeta].rounds[round];
	const qData = roundData[question + 1];
	let clues, answer, category;
	if (round === 1 || round === 2) {
		clues = [qData.clue1, qData.clue2, qData.clue3, qData.clue4];
		answer = qData.answer;
	} else if (round === 4) {
		clues = [qData.clue];
		answer = qData.answer;
		category = qData.category;
	}
	if (question >= 0) {
		prevAnswers.unshift(roundData[question].answer);
	}
	const startTime = Date.now();
	switch (round) {
	case 1:
	case 2:
		endTime = startTime + 40*1000; break;
	case 4:
		endTime = startTime + 10*1000; break;
	}
	updateLobbyState(lobby, {
		mode,
		turn: turn === 0 ? 1 : 0,
		question: question + 1,
		clues,
		answer,
		category,
		numRevealed: 1,
		buzzed: null,
		votes: {},
		voteResult: null,
		points,
		startTime,
		endTime,
		prevAnswers,
		guess: '',
		whichVictoria: Math.floor(Math.random() * N_VICTORIAS),
	});
}

// check for time run out
setInterval(() => {
	Object.keys(lobbies).forEach(lobby => {
		const l = lobbies[lobby];
		if (l.mode !== 'game' || !l.endTime || l.buzzed) return;
		if (Date.now() > l.endTime) {
			switch (l.round) {
			case 1:
			case 2:
				const buzzed = Object.keys(l.members).find(mId => l.members[mId].team === l.turn);
				updateLobbyState(lobby, { buzzed }); break;
			case 4:
				advance(lobby); break;
			}
		}
	});
}, 200);

function finishGame(lobby) {
	updateLobbyState(lobby, {
		mode: 'finished',
	});
}

function advance(lobby) {
	const { epMeta, round, question } = lobbies[lobby];
	let roundData = episodes[epMeta].rounds[round];
	console.log('advancing, question:', question, 'roundData.length:', roundData.length);
	if (question === roundData.length - 1) {
		let newRound;
		switch (round) {
		case 1:
			newRound = 2; break;
		case 2:
			newRound = 4; break;
		case 4:
			finishGame(lobby); return;
		}
		setRound(lobby, newRound);
		nextQuestion(lobby);
	} else {
		nextQuestion(lobby);
	}
}

io.on('connection', socket => {
	console.log('socket.io connection from', socket.id);

	socket.on('create-lobby', ({ state: { name } }) => {
		console.log('socket', socket.id, 'create-lobby');
		const lobby = newLobby();
		joinLobby(socket, lobby, name);
	});

	socket.on('join-lobby', ({ state: { lobby, name } }) => {
		console.log('socket', socket.id, 'join-lobby', lobby);
		joinLobby(socket, lobby.toLowerCase(), name);
	});

	socket.on('switch-team', ({ key: mId, state: { lobby } }) => {
		console.log('socket', socket.id, 'switch-team', lobby, mId);
		const members = lobbies[lobby].members;
		members[mId].team = members[mId].team === 0 ? 1 : 0;
		updateLobbyState(lobby, { members });
	});

	socket.on('select-episode', ({ key: idx, state: { lobby } }) => {
		console.log('socket', socket.id, 'select-episode', lobby, idx);
		updateLobbyState(lobby, { selectedEpisode: idx });
	});

	socket.on('start-game', ({ state: { lobby } }) => {
		console.log('socket', socket.id, 'start-game');
		lobbies[lobby].points = [0, 0];
		setRound(lobby, START_ROUND);
		nextQuestion(lobby);
	});

	socket.on('reveal', ({ state: { lobby }}) => {
		const numRevealed = lobbies[lobby].numRevealed;
		updateLobbyState(lobby, { numRevealed: numRevealed + 1 });
	});

	socket.on('buzz', ({ state: { lobby }}) => {
		updateLobbyState(lobby, { buzzed: socket.id });
		if (Object.keys(lobbies[lobby].members).length === 1) {
			setTimeout(() => {
				console.log('1 player, auto advancing');
				advance(lobby);
				updateLobbyState(lobby, { turn: 0 });
			}, 1000);
		}
	});

	socket.on('vote', ({ key: yesorno, state: { lobby }}) => {
		const { members, votes, numRevealed } = lobbies[lobby];
		votes[socket.id] = yesorno;
		updateLobbyState(lobby, { votes });
		if (Object.keys(votes).length === Object.keys(members).length - 1) {
			console.log('voting done');
			const tally = yesorno => {
				return Object.values(votes).filter(v => v === yesorno).length;
			};
			const yeses = tally('yes');
			const nos = tally('no');
			console.log('yeses:', yeses, 'nos:', nos);
			const pointMap = {
				1: 5,
				2: 3,
				3: 2,
				4: 1,
			};
			const pointsAwarded = yeses >= nos ? pointMap[numRevealed] : 0;
			updateLobbyState(lobby, { 
				voteResult: yeses >= nos ? 'yes' : 'no',
				pointsAwarded,
			});
			setTimeout(() => {
				lobbies[lobby].points[lobbies[lobby].turn] += pointsAwarded;
				advance(lobby);
			}, 3000);
		}
	});

	socket.on('correct-guess', ({ state: { lobby }}) => {
		const team = lobbies[lobby].members[socket.id].team;
		io.to(lobby).emit('flash', { winner: team });
		lobbies[lobby].points[team] += 1;
		advance(lobby);
	});

	socket.on('return-to-lobby', ({ state: { lobby }}) => {
		updateLobbyState(lobby, {
			mode: 'lobby',
		})
	});

	socket.on('disconnect', reason => {
		console.log('socket', socket.id, 'disconnected:', reason);
		try {
			leaveLobby(socket);
		} catch (e) {
			console.log('left nonexistent lobby');
		}
	});
});

http.listen(PORT, () => {
	console.log(`listening on *:${PORT}`);
});
