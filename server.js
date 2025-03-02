const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: 'http://localhost:3001',
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(express.static('client/build'));

const board = Array(7).fill(null).map(() => Array(7).fill(null));
let currentTurn = 1;
let players = [];
let gamePhase = 'placement';
let readyPlayers = new Set();
let capturedPieces = { 1: [], 2: [] };

const terrain = Array(7).fill(null).map(() => Array(7).fill(0));

terrain[3][0] = 1;
terrain[3][2] = 1;
terrain[3][4] = 1;
terrain[3][6] = 1;

terrain[3][1] = 0;
terrain[3][3] = 0;
terrain[3][5] = 0;

terrain[2][2] = 1;
terrain[2][4] = 1;
terrain[4][2] = 1;
terrain[4][4] = 1;

terrain[0][0] = 2;
terrain[0][6] = 2;
terrain[6][0] = 2;
terrain[6][6] = 2;

const sendUpdates = () => {
  players.forEach(p => {
    const playerBoard = getPlayerBoard(p.player);
    io.to(p.id).emit('boardUpdate', playerBoard);
    io.to(p.id).emit('capturedUpdate', capturedPieces);
  });
};

const getPlayerBoard = (playerNumber) => {
  return board.map(row => row.map(cell => {
    if (!cell) return null;
    if (cell.player === playerNumber || cell.visible) return cell;
    return { player: cell.player, type: 'unknown', visible: false };
  }));
};

const isValidPlacement = (x, y, player) => {
  if (gamePhase !== 'placement') return false;
  if (player === 1 && x > 2) return false;
  if (player === 2 && x < 4) return false;
  if (terrain[x][y] === 1) return false;
  return !board[x][y];
};

const isValidMove = (fromX, fromY, toX, toY, piece, board) => {
  if (toX < 0 || toX >= 7 || toY < 0 || toY >= 7 || terrain[toX][toY] === 1) return false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (piece.type !== 'scout') {
    return Math.abs(dx) + Math.abs(dy) === 1 && (!board[toX][toY] || board[toX][toY].player !== piece.player);
  } else {
    if (dx !== 0 && dy !== 0) return false;
    const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
    let x = fromX + stepX, y = fromY + stepY;
    while (x !== toX || y !== toY) {
      if (terrain[x][y] === 1 || board[x][y]) return false;
      x += stepX;
      y += stepY;
    }
    return !board[toX][toY] || board[toX][toY].player !== piece.player;
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

  if (players.length < 2) {
    const playerNumber = players.length + 1;
    players.push({ id: socket.id, player: playerNumber });
    socket.emit('assignPlayer', playerNumber);
    socket.emit('boardUpdate', getPlayerBoard(playerNumber));
    socket.emit('turnUpdate', currentTurn);
    socket.emit('phaseUpdate', gamePhase);
    socket.emit('capturedUpdate', capturedPieces);
  } else {
    socket.emit('error', 'Game is full');
    socket.disconnect();
    return;
  }

  socket.on('placePiece', ({ x, y, type, player }) => {
    if (gamePhase !== 'placement' || player !== players.find(p => p.id === socket.id).player) return;
    if (isValidPlacement(x, y, player)) {
      board[x][y] = { type, player, visible: false };
      sendUpdates();
    }
  });

  socket.on('ready', () => {
    const player = players.find(p => p.id === socket.id)?.player;
    if (!player || gamePhase !== 'placement') return;
    readyPlayers.add(player);
    io.emit('readyUpdate', Array.from(readyPlayers));

    if (readyPlayers.size === 2) {
      gamePhase = 'playing';
      io.emit('phaseUpdate', gamePhase);
      sendUpdates();
    }
  });

  socket.on('move', ({ fromX, fromY, toX, toY, player }) => {
    if (gamePhase !== 'playing' || player !== currentTurn) return;
    if (fromX < 0 || fromX >= 7 || fromY < 0 || fromY >= 7) return;

    const piece = board[fromX][fromY];
    if (piece && piece.player === player && isValidMove(fromX, fromY, toX, toY, piece, board)) {
      const target = board[toX][toY];
      if (target && target.player !== piece.player) {
        const winner = resolveCombat(piece, target);
        if (winner) {
          winner.visible = true;
          board[toX][toY] = winner;
          board[fromX][fromY] = null;
          const capturingPlayer = winner.player;
          const capturedPieceType = (winner === piece ? target.type : piece.type);
          capturedPieces[capturingPlayer].push(capturedPieceType);
        } else {
          capturedPieces[1].push(target.type);
          capturedPieces[2].push(piece.type);
          board[toX][toY] = null;
          board[fromX][fromY] = null;
        }
        if (target && target.type === 'flag') {
          io.emit('gameOver', player);
          gamePhase = 'placement';
          players = [];
          readyPlayers.clear();
          board.forEach(row => row.fill(null));
          capturedPieces = { 1: [], 2: [] };
          io.emit('phaseUpdate', gamePhase);
          sendUpdates();
          return;
        }
      } else {
        board[toX][toY] = piece;
        board[fromX][fromY] = null;
      }
      currentTurn = currentTurn === 1 ? 2 : 1;
      sendUpdates();
      io.emit('turnUpdate', currentTurn);
    }
  });

  socket.on('disconnect', () => {
    console.log('A player disconnected:', socket.id);
    players = players.filter(p => p.id !== socket.id);
    readyPlayers.delete(players.find(p => p.id === socket.id)?.player);
    if (players.length < 2) {
      gamePhase = 'placement';
      readyPlayers.clear();
      io.emit('phaseUpdate', gamePhase);
      capturedPieces = { 1: [], 2: [] };
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});