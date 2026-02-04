const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const FACTIONS = {
  humans: {
    name: 'Humans',
    units: [
      { type: 'banner', role: 'flag', count: 1 },
      { type: 'commander', role: 'marshal', count: 1 },
      { type: 'spy', role: 'spy', count: 1 },
      { type: 'ranger', role: 'scout', count: 2 },
      { type: 'sapper', role: 'miner', count: 2 },
      { type: 'trap', role: 'bomb', count: 2 },
    ],
  },
  orcs: {
    name: 'Orcs',
    units: [
      { type: 'totem', role: 'flag', count: 1 },
      { type: 'warlord', role: 'marshal', count: 1 },
      { type: 'stalker', role: 'spy', count: 1 },
      { type: 'raider', role: 'scout', count: 2 },
      { type: 'demolisher', role: 'miner', count: 2 },
      { type: 'bomb', role: 'bomb', count: 2 },
    ],
  },
};

const ROLE_RANKS = { flag: 0, spy: 1, scout: 2, miner: 3, marshal: 10, bomb: 11 };

const normalizeFactionId = (factionId) => (FACTIONS[factionId] ? factionId : 'humans');

const buildPiecesLeft = (factionId) => {
  const pieces = {};
  FACTIONS[factionId].units.forEach((unit) => {
    pieces[unit.type] = unit.count;
  });
  return pieces;
};

const getUnitDefinition = (factionId, type) => {
  const faction = FACTIONS[factionId];
  if (!faction) return null;
  return faction.units.find((unit) => unit.type === type) || null;
};

const getUnitTypeByRole = (factionId, role) => {
  const faction = FACTIONS[factionId];
  if (!faction) return null;
  const unit = faction.units.find((item) => item.role === role);
  return unit ? unit.type : null;
};

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

const createLobby = (rules) => {
  let lobbyId;
  do {
    lobbyId = crypto.randomBytes(4).toString('hex');
  } while (lobbies.has(lobbyId));
  const terrain = Array(7).fill(null).map(() => Array(7).fill(0));
  const lobby = {
    lobbyId,
    board: Array(7).fill(null).map(() => Array(7).fill(null)),
    terrain,
    baseTerrain: Array(7).fill(null).map(() => Array(7).fill(0)),
    currentTurn: 1,
    gamePhase: 'placement',
    players: [],
    readyPlayers: new Set(),
    capturedPieces: { 1: [], 2: [] },
    playerFactions: {},
    piecesLeft: { 1: {}, 2: {} },
    rules: {
      factionAbilities: Boolean(rules && rules.factionAbilities),
    },
    abilityUsed: {
      1: { marshalSwap: false, warlordRoar: false },
      2: { marshalSwap: false, warlordRoar: false },
    },
    stunnedPositions: { 1: new Set(), 2: new Set() },
    stunForPlayer: null,
  };
  lobby.terrain[3][0] = 1; lobby.terrain[3][2] = 1; lobby.terrain[3][4] = 1; lobby.terrain[3][6] = 1;
  lobby.terrain[3][1] = 0; lobby.terrain[3][3] = 0; lobby.terrain[3][5] = 0;
  lobby.terrain[2][2] = 1; lobby.terrain[2][4] = 1; lobby.terrain[4][2] = 1; lobby.terrain[4][4] = 1;
  lobby.terrain[0][0] = 2; lobby.terrain[0][6] = 2; lobby.terrain[6][0] = 2; lobby.terrain[6][6] = 2;
  lobby.baseTerrain = lobby.terrain.map((row) => row.slice());
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
    io.to(p.id).emit('abilityUpdate', {
      rules: lobby.rules,
      abilityUsed: lobby.abilityUsed[p.playerNumber],
    });
  });
};

const sendRulesInfo = (socket, lobby) => {
  socket.emit('rulesInfo', lobby.rules);
};

const resetLobby = (lobby) => {
  lobby.gamePhase = 'placement';
  lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
  lobby.terrain = lobby.baseTerrain.map((row) => row.slice());
  lobby.readyPlayers.clear();
  lobby.capturedPieces = { 1: [], 2: [] };
  lobby.currentTurn = 1;
  lobby.abilityUsed = {
    1: { marshalSwap: false, warlordRoar: false },
    2: { marshalSwap: false, warlordRoar: false },
  };
  lobby.stunnedPositions = { 1: new Set(), 2: new Set() };
  lobby.stunForPlayer = null;
  Object.entries(lobby.playerFactions).forEach(([playerNumber, factionId]) => {
    lobby.piecesLeft[playerNumber] = buildPiecesLeft(factionId);
  });
};

const getPlayerBoard = (lobby, playerNumber) => {
  return lobby.board.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      if (cell.player === playerNumber) return cell;
      const revealTo = cell.revealTo && cell.revealTo[playerNumber] > 0;
      if (cell.visible || (cell.revealTurns && cell.revealTurns > 0) || revealTo) {
        return cell;
      }
      if (cell.disguiseType && !cell.disguiseBroken) {
        return { ...cell, type: cell.disguiseType };
      }
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

const isValidMove = (lobby, fromX, fromY, toX, toY, piece, options = {}) => {
  if (toX < 0 || toX >= 7 || toY < 0 || toY >= 7 || lobby.terrain[toX][toY] === 1) return false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (piece.role !== 'scout') {
    if (
      options.allowSwap &&
      Math.abs(dx) + Math.abs(dy) === 1 &&
      lobby.board[toX][toY] &&
      lobby.board[toX][toY].player === piece.player
    ) {
      return true;
    }
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

const resolveCombat = (attacker, defender, context = {}) => {
  const attackerBonus = context.attackerBonus || 0;
  const defenderBonus = context.defenderBonus || 0;
  if (attacker.role === 'spy' && defender.role === 'marshal') return attacker;
  if (defender.role === 'bomb' && attacker.role !== 'miner') return defender;
  if (defender.role === 'bomb' && attacker.role === 'miner') return attacker;
  const attackerRank = ROLE_RANKS[attacker.role] + attackerBonus;
  const defenderRank = ROLE_RANKS[defender.role] + defenderBonus;
  if (attackerRank > defenderRank) return attacker;
  if (defenderRank > attackerRank) return defender;
  return null;
};

const decrementVisibility = (lobby) => {
  lobby.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell) return;
      if (cell.revealTurns && cell.revealTurns > 0) {
        cell.revealTurns -= 1;
      }
      if (cell.revealTo) {
        Object.keys(cell.revealTo).forEach((playerId) => {
          if (cell.revealTo[playerId] > 0) {
            cell.revealTo[playerId] -= 1;
          }
        });
      }
    });
  });
};

const applyRangerSpotter = (lobby, piece, toX, toY, playerNumber) => {
  if (!lobby.rules.factionAbilities) return;
  const factionId = lobby.playerFactions[playerNumber];
  if (factionId !== 'humans') return;
  const rangerType = getUnitTypeByRole('humans', 'scout');
  if (piece.type !== rangerType) return;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  directions.forEach(([dx, dy]) => {
    const x = toX + dx;
    const y = toY + dy;
    if (x < 0 || x >= 7 || y < 0 || y >= 7) return;
    const target = lobby.board[x][y];
    if (target && target.player !== playerNumber) {
      if (!target.revealTo) target.revealTo = {};
      target.revealTo[playerNumber] = Math.max(target.revealTo[playerNumber] || 0, 1);
    }
  });
};

const applyWarlordRoar = (lobby, piece, toX, toY, playerNumber) => {
  if (!lobby.rules.factionAbilities) return;
  const factionId = lobby.playerFactions[playerNumber];
  if (factionId !== 'orcs') return;
  const warlordType = getUnitTypeByRole('orcs', 'marshal');
  if (piece.type !== warlordType) return;
  if (lobby.abilityUsed[playerNumber].warlordRoar) return;
  const enemyNumber = playerNumber === 1 ? 2 : 1;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const stunned = new Set();
  directions.forEach(([dx, dy]) => {
    const x = toX + dx;
    const y = toY + dy;
    if (x < 0 || x >= 7 || y < 0 || y >= 7) return;
    const target = lobby.board[x][y];
    if (target && target.player === enemyNumber) {
      stunned.add(`${x},${y}`);
    }
  });
  if (stunned.size > 0) {
    lobby.abilityUsed[playerNumber].warlordRoar = true;
    lobby.stunnedPositions[enemyNumber] = stunned;
    lobby.stunForPlayer = enemyNumber;
    piece.visible = true;
  }
};

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  socket.on('createLobby', ({ factionId, rules }) => {
    const lobbyId = createLobby(rules);
    const lobby = lobbies.get(lobbyId);
    const normalizedFaction = normalizeFactionId(factionId);
    lobby.players.push({ id: socket.id, playerNumber: 1 });
    lobby.playerFactions[1] = normalizedFaction;
    lobby.piecesLeft[1] = buildPiecesLeft(normalizedFaction);
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    socket.emit('assignPlayer', { lobbyId, playerNumber: 1, factionId: normalizedFaction });
    socket.emit('factionInfo', { factionId: normalizedFaction, name: FACTIONS[normalizedFaction].name, units: FACTIONS[normalizedFaction].units });
    socket.emit('terrainReset', lobby.terrain);
    sendRulesInfo(socket, lobby);
    sendUpdates(lobbyId);
  });

  socket.on('joinLobby', ({ lobbyId, factionId }) => {
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
    const normalizedFaction = normalizeFactionId(factionId);
    lobby.players.push({ id: socket.id, playerNumber });
    lobby.playerFactions[playerNumber] = normalizedFaction;
    lobby.piecesLeft[playerNumber] = buildPiecesLeft(normalizedFaction);
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    socket.emit('assignPlayer', { lobbyId, playerNumber, factionId: normalizedFaction });
    socket.emit('factionInfo', { factionId: normalizedFaction, name: FACTIONS[normalizedFaction].name, units: FACTIONS[normalizedFaction].units });
    socket.emit('terrainReset', lobby.terrain);
    sendRulesInfo(socket, lobby);
    sendUpdates(lobbyId);
  });

  socket.on('placePiece', ({ x, y, type }) => {
    const lobbyId = socket.lobbyId;
    if (!lobbyId || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player || lobby.gamePhase !== 'placement') return;

    const factionId = lobby.playerFactions[player.playerNumber];
    const playerPiecesLeft = lobby.piecesLeft[player.playerNumber];
    const unitDefinition = getUnitDefinition(factionId, type);

    if (!unitDefinition) {
      socket.emit('error', 'Invalid unit for your faction.');
      return;
    }

    if (!playerPiecesLeft[type] || playerPiecesLeft[type] <= 0) {
      socket.emit('error', `No more ${type} pieces left to place.`);
      return;
    }
    // Assume isValidPlacement checks position validity (e.g., within player area, not on terrain)
    if (isValidPlacement(lobby, x, y, player.playerNumber)) {
      const piece = { type, role: unitDefinition.role, player: player.playerNumber, visible: false };
      if (lobby.rules.factionAbilities && unitDefinition.role === 'spy' && factionId === 'humans') {
        const disguiseType = getUnitTypeByRole('humans', 'scout');
        piece.disguiseType = disguiseType;
        piece.disguiseBroken = false;
      }
      lobby.board[x][y] = piece;
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
    if (
      lobby.rules.factionAbilities &&
      lobby.stunForPlayer === player.playerNumber &&
      lobby.stunnedPositions[player.playerNumber].has(`${fromX},${fromY}`)
    ) {
      socket.emit('error', 'That unit is stunned by Roar this turn.');
      return;
    }
    const piece = lobby.board[fromX][fromY];
    if (!piece || piece.player !== player.playerNumber) return;
    const factionId = lobby.playerFactions[player.playerNumber];
    const target = lobby.board[toX][toY];
    const isCommander = factionId === 'humans' && piece.type === getUnitTypeByRole('humans', 'marshal');
    const canSwap =
      lobby.rules.factionAbilities &&
      isCommander &&
      !lobby.abilityUsed[player.playerNumber].marshalSwap &&
      target &&
      target.player === piece.player &&
      isValidMove(lobby, fromX, fromY, toX, toY, piece, { allowSwap: true });

    if (!canSwap && !isValidMove(lobby, fromX, fromY, toX, toY, piece)) return;

    if (canSwap) {
      lobby.board[toX][toY] = piece;
      lobby.board[fromX][fromY] = target;
      piece.visible = true;
      lobby.abilityUsed[player.playerNumber].marshalSwap = true;
      applyWarlordRoar(lobby, piece, toX, toY, player.playerNumber);
      applyRangerSpotter(lobby, piece, toX, toY, player.playerNumber);
      decrementVisibility(lobby);
      if (lobby.stunForPlayer === player.playerNumber) {
        lobby.stunnedPositions[player.playerNumber] = new Set();
        lobby.stunForPlayer = null;
      }
      lobby.currentTurn = lobby.currentTurn === 1 ? 2 : 1;
      sendUpdates(lobbyId);
      return;
    }

    if (target && target.player !== piece.player) {
      if (piece.role === 'spy' && piece.disguiseType) {
        piece.disguiseBroken = true;
      }

      const distance = Math.abs(toX - fromX) + Math.abs(toY - fromY);
      const orcScoutType = getUnitTypeByRole('orcs', 'scout');
      if (
        lobby.rules.factionAbilities &&
        factionId === 'orcs' &&
        piece.type === orcScoutType &&
        distance >= 3
      ) {
        if (!target.revealTo) target.revealTo = {};
        target.revealTo[player.playerNumber] = Math.max(target.revealTo[player.playerNumber] || 0, 2);
      }

      let attackerBonus = 0;
      if (
        lobby.rules.factionAbilities &&
        factionId === 'orcs' &&
        piece.type === getUnitTypeByRole('orcs', 'spy') &&
        lobby.terrain[fromX][fromY] === 2
      ) {
        attackerBonus = 1;
      }

      const winner = resolveCombat(piece, target, { attackerBonus });
      if (winner) {
        winner.visible = true;
        lobby.board[toX][toY] = winner;
        lobby.board[fromX][fromY] = null;
        const capturingPlayer = winner.player;
        const capturedPieceType = winner === piece ? target.type : piece.type;
        lobby.capturedPieces[capturingPlayer].push(capturedPieceType);

        if (winner === piece && target.role === 'bomb' && piece.role === 'miner' && lobby.rules.factionAbilities) {
          if (factionId === 'humans' && piece.type === getUnitTypeByRole('humans', 'miner')) {
            piece.revealTurns = 2;
          }
          if (factionId === 'orcs' && piece.type === getUnitTypeByRole('orcs', 'miner')) {
            lobby.terrain[toX][toY] = 1;
            io.to(lobbyId).emit('terrainUpdate', { x: toX, y: toY, terrainType: 1 });
          }
        }
      } else {
        lobby.capturedPieces[1].push(target.type);
        lobby.capturedPieces[2].push(piece.type);
        lobby.board[toX][toY] = null;
        lobby.board[fromX][fromY] = null;
      }
      if (target && target.role === 'flag') {
        io.to(lobbyId).emit('gameOver', player.playerNumber);
        resetLobby(lobby);
        io.to(lobbyId).emit('terrainReset', lobby.terrain);
        sendUpdates(lobbyId);
        return;
      }
    } else {
      lobby.board[toX][toY] = piece;
      lobby.board[fromX][fromY] = null;
    }

    const movedPiece = lobby.board[toX][toY];
    if (movedPiece) {
      applyWarlordRoar(lobby, movedPiece, toX, toY, player.playerNumber);
      applyRangerSpotter(lobby, movedPiece, toX, toY, player.playerNumber);
    }

    decrementVisibility(lobby);
    if (lobby.stunForPlayer === player.playerNumber) {
      lobby.stunnedPositions[player.playerNumber] = new Set();
      lobby.stunForPlayer = null;
    }
    lobby.currentTurn = lobby.currentTurn === 1 ? 2 : 1;
    sendUpdates(lobbyId);
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
        resetLobby(lobby);
        io.to(lobbyId).emit('terrainReset', lobby.terrain);
        sendUpdates(lobbyId);
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});