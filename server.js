const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: 'http://localhost:3001',
  methods: ['GET', 'POST'],
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(express.static('client/build'));

const lobbies = new Map();

const createLobby = () => {
  let lobbyId;
  do {
    lobbyId = crypto.randomBytes(4).toString('hex');
  } while (lobbies.has(lobbyId));
  const lobby = {
    lobbyId,
    board: Array(7).fill(null).map(() => Array(7).fill(null)),
    terrain: Array(7).fill(null).map(() => Array(7).fill(0)),
    currentTurn: 1,
    gamePhase: 'placement',
    players: [],
    readyPlayers: new Set(),
    capturedPieces: { 1: [], 2: [] },
    piecesLeft: {
      1: { flag: 1, marshal: 1, spy: 1, scout: 2, miner: 2, bomb: 2 },
      2: { flag: 1, marshal: 1, spy: 1, scout: 2, miner: 2, bomb: 2 },
    },
  };
  lobby.terrain[3][0] = 1; lobby.terrain[3][2] = 1; lobby.terrain[3][4] = 1; lobby.terrain[3][6] = 1;
  lobby.terrain[3][1] = 0; lobby.terrain[3][3] = 0; lobby.terrain[3][5] = 0;
  lobby.terrain[2][2] = 1; lobby.terrain[2][4] = 1; lobby.terrain[4][2] = 1; lobby.terrain[4][4] = 1;
  lobby.terrain[0][0] = 2; lobby.terrain[0][6] = 2; lobby.terrain[6][0] = 2; lobby.terrain[6][6] = 2;
  lobbies.set(lobbyId, lobby);
  return lobbyId;
};

const sendUpdates = (lobbyId) => {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  lobby.players.forEach((p) => {
    const playerBoard = getPlayerBoard(lobby, p.playerNumber);
    io.to(p.id).emit('boardUpdate', playerBoard);
    io.to(p.id).emit('capturedUpdate', lobby.capturedPieces);
    io.to(p.id).emit('turnUpdate', lobby.currentTurn);
    io.to(p.id).emit('phaseUpdate', lobby.gamePhase);
  });
};

const getPlayerBoard = (lobby, playerNumber) => {
  return lobby.board.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      if (cell.player === playerNumber || cell.visible) return cell;
      return { player: cell.player, type: 'unknown', visible: false };
    })
  );
};

const isValidPlacement = (lobby, x, y, playerNumber) => {
  if (lobby.gamePhase !== 'placement') return false;
  if (playerNumber === 1 && x > 2) return false;
  if (playerNumber === 2 && x < 4) return false;
  if (lobby.terrain[x][y] === 1) return false;
  return !lobby.board[x][y];
};

const isValidMove = (lobby, fromX, fromY, toX, toY, piece) => {
  if (toX < 0 || toX >= 7 || toY < 0 || toY >= 7 || lobby.terrain[toX][toY] === 1) return false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (piece.type !== 'scout') {
    return Math.abs(dx) + Math.abs(dy) === 1 && (!lobby.board[toX][toY] || lobby.board[toX][toY].player !== piece.player);
  } else {
    if (dx !== 0 && dy !== 0) return false;
    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    let x = fromX + stepX, y = fromY + stepY;
    while (x !== toX || y !== toY) {
      if (lobby.terrain[x][y] === 1 || lobby.board[x][y]) return false;
      x += stepX;
      y += stepY;
    }
    return !lobby.board[toX][toY] || lobby.board[toX][toY].player !== piece.player;
  }
};

const resolveCombat = (attacker, defender) => {
  const ranks = { flag: 0, spy: 1, scout: 2, miner: 3, marshal: 10, bomb: 11 };
  if (attacker.type === 'spy' && defender.type === 'marshal') return attacker;
  if (defender.type === 'bomb' && attacker.type !== 'miner') return defender;
  if (defender.type === 'bomb' && attacker.type === 'miner') return attacker;
  const attackerRank = ranks[attacker.type];
  const defenderRank = ranks[defender.type];
  if (attackerRank > defenderRank) return attacker;
  if (defenderRank > attackerRank) return defender;
  return null;
};

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  socket.on('createLobby', () => {
    const lobbyId = createLobby();
    const lobby = lobbies.get(lobbyId);
    lobby.players.push({ id: socket.id, playerNumber: 1 });
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    socket.emit('assignPlayer', { lobbyId, playerNumber: 1 });
    sendUpdates(lobbyId);
  });

  socket.on('joinLobby', (lobbyId) => {
    if (!lobbies.has(lobbyId)) {
      socket.emit('error', 'Lobby not found');
      return;
    }
    const lobby = lobbies.get(lobbyId);
    if (lobby.players.length >= 2) {
      socket.emit('error', 'Lobby is full');
      return;
    }
    const playerNumber = 2;
    lobby.players.push({ id: socket.id, playerNumber });
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    socket.emit('assignPlayer', { lobbyId, playerNumber });
    sendUpdates(lobbyId);
  });

  socket.on('placePiece', ({ x, y, type }) => {
    const lobbyId = socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player || lobby.gamePhase !== 'placement') return;

    const playerPiecesLeft = lobby.piecesLeft[player.playerNumber];

    if (!playerPiecesLeft[type] || playerPiecesLeft[type] <= 0) {
      socket.emit('error', `No more ${type} pieces left to place.`);
      return;
    }
    // Assume isValidPlacement checks position validity (e.g., within player area, not on terrain)
    if (isValidPlacement(lobby, x, y, player.playerNumber)) {
      lobby.board[x][y] = { type, player: player.playerNumber, visible: false };
      playerPiecesLeft[type] -= 1; // Decrement only on successful placement
      sendUpdates(lobbyId); // Your existing function to broadcast board state
      // Send updated piecesLeft to the client
      socket.emit('piecesLeftUpdate', playerPiecesLeft);
    } else {
      socket.emit('error', 'Invalid placement position.');
    }
  });

  socket.on('ready', () => {
    const lobbyId = socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player) return;
    lobby.readyPlayers.add(player.playerNumber);
    io.to(lobbyId).emit('readyUpdate', Array.from(lobby.readyPlayers));
    if (lobby.readyPlayers.size === 2) {
      lobby.gamePhase = 'playing';
      sendUpdates(lobbyId);
    }
  });

  socket.on('move', ({ fromX, fromY, toX, toY }) => {
    const lobbyId = socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player || lobby.gamePhase !== 'playing' || player.playerNumber !== lobby.currentTurn) return;
    const piece = lobby.board[fromX][fromY];
    if (piece && piece.player === player.playerNumber && isValidMove(lobby, fromX, fromY, toX, toY, piece)) {
      const target = lobby.board[toX][toY];
      if (target && target.player !== piece.player) {
        const winner = resolveCombat(piece, target);
        if (winner) {
          winner.visible = true;
          lobby.board[toX][toY] = winner;
          lobby.board[fromX][fromY] = null;
          const capturingPlayer = winner.player;
          const capturedPieceType = winner === piece ? target.type : piece.type;
          lobby.capturedPieces[capturingPlayer].push(capturedPieceType);
        } else {
          lobby.capturedPieces[1].push(target.type);
          lobby.capturedPieces[2].push(piece.type);
          lobby.board[toX][toY] = null;
          lobby.board[fromX][fromY] = null;
        }
        if (target && target.type === 'flag') {
          io.to(lobbyId).emit('gameOver', player.playerNumber);
          lobby.gamePhase = 'placement';
          lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
          lobby.readyPlayers.clear();
          lobby.capturedPieces = { 1: [], 2: [] };
          lobby.currentTurn = 1;
          sendUpdates(lobbyId);
          return;
        }
      } else {
        lobby.board[toX][toY] = piece;
        lobby.board[fromX][fromY] = null;
      }
      lobby.currentTurn = lobby.currentTurn === 1 ? 2 : 1;
      sendUpdates(lobbyId);
    }
  });

  socket.on('disconnect', () => {
    console.log('A player disconnected:', socket.id);
    const lobbyId = socket.lobbyId;
    if (lobbyId && lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      lobby.players = lobby.players.filter((p) => p.id !== socket.id);
      if (lobby.players.length === 0) {
        lobbies.delete(lobbyId);
      } else {
        io.to(lobbyId).emit('playerDisconnected');
        lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
        lobby.currentTurn = 1;
        lobby.gamePhase = 'placement';
        lobby.readyPlayers.clear();
        lobby.capturedPieces = { 1: [], 2: [] };
        sendUpdates(lobbyId);
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});