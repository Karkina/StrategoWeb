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

/**
 * Creates a new game lobby with a unique ID and initial state.
 */
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
      1: { queen: 1, guard: 3, cavalry: 2, scout: 2, disruptor: 1 },
      2: { queen: 1, guard: 3, cavalry: 2, scout: 2, disruptor: 1 },
    },
    playerTurns: { 1: 0, 2: 0 }, // Tracks turns for Queen's movement restriction
  };
  // Define terrain layout (1 = obstacle, 2 = special terrain)
  lobby.terrain[3][0] = 1; lobby.terrain[3][2] = 1; lobby.terrain[3][4] = 1; lobby.terrain[3][6] = 1;
  lobby.terrain[3][1] = 0; lobby.terrain[3][3] = 0; lobby.terrain[3][5] = 0;
  lobby.terrain[2][2] = 1; lobby.terrain[2][4] = 1; lobby.terrain[4][2] = 1; lobby.terrain[4][4] = 1;
  lobby.terrain[0][0] = 2; lobby.terrain[0][6] = 2; lobby.terrain[6][0] = 2; lobby.terrain[6][6] = 2;
  lobbies.set(lobbyId, lobby);
  return lobbyId;
};

/**
 * Sends game state updates to all players in the lobby.
 */
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

/**
 * Returns the board state visible to a specific player, hiding opponent piece types unless revealed.
 */
const getPlayerBoard = (lobby, playerNumber) => {
  return lobby.board.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      if (cell.player === playerNumber || cell.visible) return cell;
      return { player: cell.player, type: 'unknown', visible: false };
    })
  );
};

/**
 * Validates piece placement during the placement phase.
 */
const isValidPlacement = (lobby, x, y, playerNumber) => {
  if (lobby.gamePhase !== 'placement') return false;
  if (playerNumber === 1 && x > 2) return false; // Player 1's side (rows 0-2)
  if (playerNumber === 2 && x < 4) return false; // Player 2's side (rows 4-6)
  if (lobby.terrain[x][y] === 1) return false; // No placement on obstacles
  return !lobby.board[x][y]; // Space must be empty
};

/**
 * Validates piece movement based on type-specific rules.
 */
const isValidMove = (lobby, fromX, fromY, toX, toY, piece, playerNumber) => {
  if (toX < 0 || toX >= 7 || toY < 0 || toY >= 7 || lobby.terrain[toX][toY] === 1) return false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const target = lobby.board[toX][toY];

  if (piece.type === 'queen') {
    // Queen moves only on even-numbered turns (after odd moves, turn count is odd)
    if (lobby.playerTurns[playerNumber] % 2 !== 1) return false;
    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance > 3) return false;
    if (dx !== 0 && dy !== 0) return false; // Orthogonal only
    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    let x = fromX + stepX;
    let y = fromY + stepY;
    while (x !== toX || y !== toY) {
      if (lobby.board[x][y] || lobby.terrain[x][y] === 1) return false;
      x += stepX;
      y += stepY;
    }
  } else if (piece.type === 'scout') {
    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance > 2) return false;
    if (dx !== 0 && dy !== 0) return false; // Orthogonal only
    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    let x = fromX + stepX;
    let y = fromY + stepY;
    while (x !== toX || y !== toY) {
      if (lobby.board[x][y] || lobby.terrain[x][y] === 1) return false;
      x += stepX;
      y += stepY;
    }
  } else if (piece.type === 'cavalry') {
    const dxAbs = Math.abs(dx);
    const dyAbs = Math.abs(dy);
    if ((dxAbs === 2 && dyAbs === 1) || (dxAbs === 1 && dyAbs === 2)) {
      return true; // L-shaped movement, can jump over pieces
    }
    return false;
  } else {
    // Guard and Disruptor move 1 space in any direction
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  }
  return !target || target.player !== piece.player; // Can't move to own piece
};

/**
 * Finds the Queen's position for a given player.
 */
const findQueen = (lobby, playerNumber) => {
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      const piece = lobby.board[x][y];
      if (piece && piece.type === 'queen' && piece.player === playerNumber) {
        return { x, y };
      }
    }
  }
  return null;
};

/**
 * Checks if the Queen is disrupted by an opponent's Disruptor within 3 spaces.
 */
const isQueenDisrupted = (lobby, queenX, queenY, playerNumber) => {
  const opponent = playerNumber === 1 ? 2 : 1;
  for (let i = Math.max(0, queenX - 3); i <= Math.min(6, queenX + 3); i++) {
    for (let j = Math.max(0, queenY - 3); j <= Math.min(6, queenY + 3); j++) {
      const piece = lobby.board[i][j];
      if (piece && piece.type === 'disruptor' && piece.player === opponent) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Resolves combat between two pieces, considering Guard's bonus near the Queen.
 */
const resolveCombat = (lobby, attacker, defender, attackerX, attackerY, defenderX, defenderY) => {
  const baseStrengths = { queen: 5, guard: 4, cavalry: 3, scout: 2, disruptor: 1 };
  let attackerStrength = baseStrengths[attacker.type];
  let defenderStrength = baseStrengths[defender.type];

  // Guard bonus when within 2 spaces of an undisrupted Queen
  if (attacker.type === 'guard') {
    const attackerQueen = findQueen(lobby, attacker.player);
    if (attackerQueen && !isQueenDisrupted(lobby, attackerQueen.x, attackerQueen.y, attacker.player)) {
      const distance = Math.max(Math.abs(attackerX - attackerQueen.x), Math.abs(attackerY - attackerQueen.y));
      if (distance <= 2) attackerStrength += 2;
    }
  }
  if (defender.type === 'guard') {
    const defenderQueen = findQueen(lobby, defender.player);
    if (defenderQueen && !isQueenDisrupted(lobby, defenderQueen.x, defenderQueen.y, defender.player)) {
      const distance = Math.max(Math.abs(defenderX - defenderQueen.x), Math.abs(defenderY - defenderQueen.y));
      if (distance <= 2) defenderStrength += 2;
    }
  }

  if (attackerStrength > defenderStrength) return attacker;
  if (defenderStrength > attackerStrength) return defender;
  return null; // Tie results in both pieces removed
};

/**
 * Socket.IO event handlers for game logic.
 */
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
    if (isValidPlacement(lobby, x, y, player.playerNumber)) {
      lobby.board[x][y] = { type, player: player.playerNumber, visible: false };
      playerPiecesLeft[type] -= 1;
      sendUpdates(lobbyId);
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
    if (piece && piece.player === player.playerNumber && isValidMove(lobby, fromX, fromY, toX, toY, piece, player.playerNumber)) {
      const target = lobby.board[toX][toY];
      if (target && target.player !== piece.player) {
        const winner = resolveCombat(lobby, piece, target, fromX, fromY, toX, toY);
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
        if (target && target.type === 'queen') {
          io.to(lobbyId).emit('gameOver', player.playerNumber);
          lobby.gamePhase = 'placement';
          lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
          lobby.readyPlayers.clear();
          lobby.capturedPieces = { 1: [], 2: [] };
          lobby.currentTurn = 1;
          lobby.playerTurns = { 1: 0, 2: 0 };
          sendUpdates(lobbyId);
          return;
        }
      } else {
        lobby.board[toX][toY] = piece;
        lobby.board[fromX][fromY] = null;
      }
      lobby.playerTurns[player.playerNumber] += 1;
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
        lobby.playerTurns = { 1: 0, 2: 0 };
        sendUpdates(lobbyId);
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});