const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto'); // For generating unique IDs

const app = express();
const server = http.createServer(app);

// --- Constants ---
const TURN_DURATION = 30 * 1000; // 30 seconds in milliseconds
const TERRAIN_TYPES = {
  PLAINS: 0,
  LAKE: 1,   // Impassable
  THRONE: 2, // Special zone (formerly special corner)
  FOREST: 3, // Potential future effects
  HILLS: 4,  // Potential future effects (e.g., combat bonus)
};
const PIECE_TYPES = {
  QUEEN: 'queen',
  GUARD: 'guard',
  CAVALRY: 'cavalry',
  SCOUT: 'scout',
  DISRUPTOR: 'disruptor',
  SPY: 'spy',
  TACTICIAN: 'tactician', // New piece type
  UNKNOWN: 'unknown', // For client-side representation only
};
const INITIAL_PIECES = {
  [PIECE_TYPES.QUEEN]: 1,
  [PIECE_TYPES.GUARD]: 3,
  [PIECE_TYPES.CAVALRY]: 2,
  [PIECE_TYPES.SCOUT]: 2,
  [PIECE_TYPES.DISRUPTOR]: 1,
  [PIECE_TYPES.SPY]: 1,
  [PIECE_TYPES.TACTICIAN]: 1  // Adding 1 Tactician per player
};
const BASE_STRENGTHS = {
  [PIECE_TYPES.QUEEN]: 5,
  [PIECE_TYPES.GUARD]: 4,
  [PIECE_TYPES.CAVALRY]: 3,
  [PIECE_TYPES.SCOUT]: 2,
  [PIECE_TYPES.DISRUPTOR]: 1,
  [PIECE_TYPES.SPY]: 1,
  [PIECE_TYPES.TACTICIAN]: 2  // Tactician has base strength of 2
};
// --- End Constants ---


// Configure CORS for your React app's origin
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3001'; // Allow configuring via env var
app.use(cors({
  origin: clientOrigin,
  methods: ['GET', 'POST'],
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Optional: Add ping settings for faster disconnect detection
  // pingInterval: 10000,
  // pingTimeout: 5000,
});

// Serve static files from React build if needed (for production)
// app.use(express.static('client/build'));

const lobbies = new Map(); // Use a Map to store lobbies { lobbyId: lobbyState }

/**
 * Generates the initial terrain layout.
 */
const generateInitialTerrain = () => {
  const grid = Array(7).fill(null).map(() => Array(7).fill(TERRAIN_TYPES.PLAINS));
  // Lakes (Impassable)
  grid[3][0] = TERRAIN_TYPES.LAKE; grid[3][2] = TERRAIN_TYPES.LAKE; grid[3][4] = TERRAIN_TYPES.LAKE; grid[3][6] = TERRAIN_TYPES.LAKE;
  grid[2][2] = TERRAIN_TYPES.LAKE; grid[2][4] = TERRAIN_TYPES.LAKE; grid[4][2] = TERRAIN_TYPES.LAKE; grid[4][4] = TERRAIN_TYPES.LAKE;
  // Throne zones (Objectives)
  grid[0][3] = TERRAIN_TYPES.THRONE; grid[6][3] = TERRAIN_TYPES.THRONE;
  // Forests
  grid[1][1] = TERRAIN_TYPES.FOREST; grid[1][5] = TERRAIN_TYPES.FOREST; grid[5][1] = TERRAIN_TYPES.FOREST; grid[5][5] = TERRAIN_TYPES.FOREST;
  // Hills
  grid[2][3] = TERRAIN_TYPES.HILLS; grid[4][3] = TERRAIN_TYPES.HILLS;
  return grid;
};


/**
 * Creates a new lobby with a unique ID and initial state.
 */
const createLobby = () => {
  let lobbyId;
  do {
    lobbyId = crypto.randomBytes(4).toString('hex'); // Generate a unique lobby ID
  } while (lobbies.has(lobbyId));

  const lobby = {
    lobbyId,
    board: Array(7).fill(null).map(() => Array(7).fill(null)), // Represents the game board cells
    terrain: generateInitialTerrain(), // Terrain layout using codes
    currentTurn: 1, // Player 1 starts
    gamePhase: 'placement', // Initial phase is placement
    players: [], // Array of { id: socket.id, playerNumber: 1|2 }
    readyPlayers: new Set(), // Set of playerNumbers who are ready
    capturedPieces: { 1: [], 2: [] }, // Pieces captured by each player
    piecesLeft: { // Pieces available for placement
      1: { ...INITIAL_PIECES },
      2: { ...INITIAL_PIECES },
    },
    playerTurns: { 1: 0, 2: 0 }, // Tracks turn counts for Queen/other rules
    // Removed disruptorUsed - incorporated into combat check directly
    turnTimerId: null, // Holds the ID of the current turn's setTimeout
    lastMoveTimestamp: Date.now(), // Track activity
  };

  lobbies.set(lobbyId, lobby);
  console.log(`Lobby created: ${lobbyId}`);
  return lobbyId;
};

/**
 * Clears the turn timer for a given lobby.
 */
const clearTurnTimer = (lobbyId) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby && lobby.turnTimerId) {
        clearTimeout(lobby.turnTimerId);
        lobby.turnTimerId = null;
        // console.log(`[${lobbyId}] Timer cleared.`);
    }
};

/**
 * Starts the turn timer for the current player in a lobby.
 */
const startTurnTimer = (lobbyId) => {
    clearTurnTimer(lobbyId); // Clear any existing timer first
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'playing') return; // Only run timer during play

    lobby.turnTimerId = setTimeout(() => {
        console.log(`[${lobbyId}] Player ${lobby.currentTurn} timed out.`);
        const timedOutPlayer = lobby.currentTurn;

        // Automatically switch turn
        lobby.currentTurn = timedOutPlayer === 1 ? 2 : 1;
        lobby.playerTurns[timedOutPlayer]++; // Increment turn count as if they passed
        lobby.lastMoveTimestamp = Date.now();

        // Notify players about the timeout
        io.to(lobbyId).emit('timeout', { player: timedOutPlayer });

        // Send updates reflecting the new turn
        sendUpdates(lobbyId);

        // Start the timer for the *next* player
        startTurnTimer(lobbyId);

    }, TURN_DURATION);
    // console.log(`[${lobbyId}] Timer started for Player ${lobby.currentTurn}. ID: ${lobby.turnTimerId}`);
};

/**
 * Returns the board state visible to a specific player.
 * Hides non-visible opponent pieces, showing them as 'unknown'.
 */
const getPlayerBoard = (lobby, playerNumber) => {
  return lobby.board.map((row) =>
    row.map((cell) => {
      if (!cell) return null; // Empty cell
      // Show own pieces or pieces marked as visible
      if (cell.player === playerNumber || cell.visible) {
        return { ...cell }; // Return a copy
      }
      // Hide opponent's piece type
      return { player: cell.player, type: PIECE_TYPES.UNKNOWN, visible: false, id: cell.id }; // Include player and ID but hide type
    })
  );
};

/**
 * Sends game state updates to all players in the lobby.
 * Uses getPlayerBoard to send tailored board views.
 */
const sendUpdates = (lobbyId) => {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.players.forEach((p) => {
    const playerSpecificBoard = getPlayerBoard(lobby, p.playerNumber);
    const socket = io.sockets.sockets.get(p.id); // Get socket instance by ID
    if (socket) {
        // Send updates specific to each player
        socket.emit('boardUpdate', playerSpecificBoard);
        socket.emit('capturedUpdate', lobby.capturedPieces); // Everyone sees all captures
        socket.emit('turnUpdate', lobby.currentTurn);
        socket.emit('phaseUpdate', lobby.gamePhase);
         // Send player-specific pieces left only during placement
        if (lobby.gamePhase === 'placement') {
            socket.emit('piecesLeftUpdate', lobby.piecesLeft[p.playerNumber]);
        }
        socket.emit('readyUpdate', Array.from(lobby.readyPlayers)); // Send ready status
    }
  });
  // console.log(`[${lobbyId}] Updates sent.`);
};


/**
 * Validates piece placement during the 'placement' phase.
 */
const isValidPlacement = (lobby, x, y, playerNumber) => {
  // Check phase and basic bounds
  if (lobby.gamePhase !== 'placement' || x < 0 || x >= 7 || y < 0 || y >= 7) return { valid: false, reason: "Not placement phase or out of bounds." };

  // Check player-specific rows
  // Player 1 (bottom) can place pieces in the bottom two rows (5-6)
  if (playerNumber === 1 && (x < 5 || x > 6)) return { valid: false, reason: "Player 1 must place in rows 5-6." };
  // Player 2 (top) can place pieces in the top two rows (0-1)
  if (playerNumber === 2 && (x < 0 || x > 1)) return { valid: false, reason: "Player 2 must place in rows 0-1." };

  // Check terrain (Lakes are impassable)
  if (lobby.terrain[x][y] === TERRAIN_TYPES.LAKE) return { valid: false, reason: "Cannot place on Lake terrain." };

  // Check if cell is already occupied
  if (lobby.board[x][y]) return { valid: false, reason: "Cell is already occupied." };

  return { valid: true };
};


/**
 * Validates a piece's move according to its type and game rules.
 */
const isValidMove = (lobby, fromX, fromY, toX, toY, piece, playerNumber) => {
    // Basic checks: bounds, target terrain, not moving to same square
    if (toX < 0 || toX >= 7 || toY < 0 || toY >= 7) return { valid: false, reason: "Move is out of bounds." };
    if (fromX === toX && fromY === toY) return { valid: false, reason: "Cannot move to the same square." };
    if (lobby.terrain[toX][toY] === TERRAIN_TYPES.LAKE) return { valid: false, reason: "Cannot move into Lake terrain." };

    const dx = toX - fromX;
    const dy = toY - fromY;
    const targetCell = lobby.board[toX][toY];

    // Cannot move onto a friendly piece
    if (targetCell && targetCell.player === playerNumber) return { valid: false, reason: "Cannot move onto your own piece." };

    // Piece specific rules
    switch (piece.type) {
        case PIECE_TYPES.QUEEN:
            // Queen moves only on specific turns (adjust logic if needed, e.g., every turn after first move)
            // This example: P1 moves on their odd turns (1st, 3rd,..), P2 on their odd turns (1st, 3rd,...)
            const playerTurnCount = lobby.playerTurns[playerNumber];
            // If Queen hasn't moved yet (turn 0), allow move. Otherwise, check odd turn.
            // if (playerTurnCount > 0 && playerTurnCount % 2 !== 1) {
            //     return { valid: false, reason: "Queen can only move on specific turns." };
            // } // Removed this restriction based on user feedback/common Stratego rules

            // Movement: Up to 3 squares orthogonally (no diagonals)
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance === 0 || distance > 3 || (dx !== 0 && dy !== 0)) {
                return { valid: false, reason: "Queen moves 1-3 squares orthogonally." };
            }
            // Check for blocking pieces along the path
            const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
            const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
            let currentX = fromX + stepX;
            let currentY = fromY + stepY;
            while (currentX !== toX || currentY !== toY) {
                if (lobby.board[currentX][currentY] || lobby.terrain[currentX][currentY] === TERRAIN_TYPES.LAKE) {
                    return { valid: false, reason: "Queen's path is blocked." };
                }
                currentX += stepX;
                currentY += stepY;
            }
            break; // Valid path

        case PIECE_TYPES.SCOUT:
             // Movement: 1 or 2 squares orthogonally
            const scoutDistance = Math.abs(dx) + Math.abs(dy);
            if (scoutDistance === 0 || scoutDistance > 2 || (dx !== 0 && dy !== 0)) {
                return { valid: false, reason: "Scout moves 1-2 squares orthogonally." };
            }
             // Check for blocking pieces (only if moving 2 squares)
             if (scoutDistance === 2) {
                 const midX = fromX + (dx === 0 ? 0 : dx > 0 ? 1 : -1);
                 const midY = fromY + (dy === 0 ? 0 : dy > 0 ? 1 : -1);
                 if (lobby.board[midX][midY] || lobby.terrain[midX][midY] === TERRAIN_TYPES.LAKE) {
                    return { valid: false, reason: "Scout's path is blocked." };
                 }
             }
            break; // Valid path

        case PIECE_TYPES.CAVALRY:
            // Movement: L-shape (2 in one direction, 1 perpendicular)
            const dxAbs = Math.abs(dx);
            const dyAbs = Math.abs(dy);
            if (!((dxAbs === 2 && dyAbs === 1) || (dxAbs === 1 && dyAbs === 2))) {
                return { valid: false, reason: "Cavalry moves in an L-shape." };
            }
            // Cavalry can jump over pieces and lakes (no path check needed)
            break;

        case PIECE_TYPES.GUARD:
        case PIECE_TYPES.DISRUPTOR:
        case PIECE_TYPES.SPY:
            // Movement: Exactly 1 square orthogonally or diagonally (adjust if diagonal not allowed)
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (Math.abs(dx) + Math.abs(dy) === 0)) {
                 return { valid: false, reason: `${piece.type} moves exactly 1 adjacent square.` };
            }
            // Simple 1-step move - no path check needed
            break;

        case PIECE_TYPES.TACTICIAN:
            // Movement: 1 square orthogonally (not diagonally)
            if (Math.abs(dx) + Math.abs(dy) !== 1) {
                return { valid: false, reason: "Tactician moves 1 square orthogonally." };
            }
            // Simple 1-step orthogonal move - no path check needed
            break;

        default:
            return { valid: false, reason: "Unknown piece type cannot move." };
    }

    // If all checks pass
    return { valid: true };
};

/**
 * Finds the position {x, y} of a player's Queen.
 * Returns null if the Queen is not found (captured).
 */
const findQueen = (lobby, playerNumber) => {
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      const piece = lobby.board[x][y];
      if (piece && piece.type === PIECE_TYPES.QUEEN && piece.player === playerNumber) {
        return { x, y };
      }
    }
  }
  return null; // Queen not found
};

/**
 * Checks if a Queen at queenPos is disrupted by an enemy Disruptor within 3 steps.
 */
const isQueenDisrupted = (lobby, queenPos, playerNumber) => {
    if (!queenPos) return false; // No queen to disrupt
    const opponent = playerNumber === 1 ? 2 : 1;
    const { x: queenX, y: queenY } = queenPos;

    // Check a 7x7 area centered on the queen (max 3 steps away)
    for (let i = Math.max(0, queenX - 3); i <= Math.min(6, queenX + 3); i++) {
        for (let j = Math.max(0, queenY - 3); j <= Math.min(6, queenY + 3); j++) {
            // Calculate distance if needed, but simple check is enough here if just radius
            // const distance = Math.max(Math.abs(i - queenX), Math.abs(j - queenY)); // Chebyshev distance
            // if (distance > 3) continue;

            const piece = lobby.board[i][j];
            if (piece && piece.type === PIECE_TYPES.DISRUPTOR && piece.player === opponent) {
                // Found an enemy disruptor within range
                return true;
            }
        }
    }
    return false; // No disruptor found
};


/**
 * Resolves combat between an attacker and a defender piece.
 * Accounts for terrain (hills), Guard bonus, and Queen aura (if not disrupted).
 * Returns the winning piece object (copy) or null if mutual destruction.
 */
const resolveCombat = (lobby, attacker, defender, attackerPos, defenderPos) => {
    let attackerStrength = BASE_STRENGTHS[attacker.type] || 0;
    let defenderStrength = BASE_STRENGTHS[defender.type] || 0;

    // 1. Terrain Bonus (Hills)
    if (lobby.terrain[attackerPos.x][attackerPos.y] === TERRAIN_TYPES.HILLS) attackerStrength++;
    if (lobby.terrain[defenderPos.x][defenderPos.y] === TERRAIN_TYPES.HILLS) defenderStrength++;

    // 2. Find Queens and check if disrupted
    const attackerQueenPos = findQueen(lobby, attacker.player);
    const defenderQueenPos = findQueen(lobby, defender.player);
    const isAttackerQueenDisrupted = isQueenDisrupted(lobby, attackerQueenPos, attacker.player);
    const isDefenderQueenDisrupted = isQueenDisrupted(lobby, defenderQueenPos, defender.player);

    // 3. Guard Bonus (Adjacent to own non-disrupted Queen)
    if (attacker.type === PIECE_TYPES.GUARD && attackerQueenPos && !isAttackerQueenDisrupted) {
        const distToQueen = Math.max(Math.abs(attackerPos.x - attackerQueenPos.x), Math.abs(attackerPos.y - attackerQueenPos.y));
        if (distToQueen <= 1) attackerStrength += 2; // Boost if adjacent
    }
    if (defender.type === PIECE_TYPES.GUARD && defenderQueenPos && !isDefenderQueenDisrupted) {
        const distToQueen = Math.max(Math.abs(defenderPos.x - defenderQueenPos.x), Math.abs(defenderPos.y - defenderQueenPos.y));
        if (distToQueen <= 1) defenderStrength += 2; // Boost if adjacent
    }
    
    // 4. Tactician Bonus (Adjacent friendly units get +1 strength)
    // Check for adjacent Tacticians for attacker
    const adjacentOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]; // All 8 directions
    for (const [dx, dy] of adjacentOffsets) {
        const checkX = attackerPos.x + dx;
        const checkY = attackerPos.y + dy;
        if (checkX >= 0 && checkX < 7 && checkY >= 0 && checkY < 7) {
            const adjacentPiece = lobby.board[checkX][checkY];
            if (adjacentPiece && adjacentPiece.player === attacker.player && 
                adjacentPiece.type === PIECE_TYPES.TACTICIAN && attacker.type !== PIECE_TYPES.TACTICIAN) {
                attackerStrength += 1;
                console.log(`Attacker ${attacker.type} boosted by Tactician at (${checkX},${checkY})`);
            }
        }
    }
    
    // Check for adjacent Tacticians for defender
    for (const [dx, dy] of adjacentOffsets) {
        const checkX = defenderPos.x + dx;
        const checkY = defenderPos.y + dy;
        if (checkX >= 0 && checkX < 7 && checkY >= 0 && checkY < 7) {
            const adjacentPiece = lobby.board[checkX][checkY];
            if (adjacentPiece && adjacentPiece.player === defender.player && 
                adjacentPiece.type === PIECE_TYPES.TACTICIAN && defender.type !== PIECE_TYPES.TACTICIAN) {
                defenderStrength += 1;
                console.log(`Defender ${defender.type} boosted by Tactician at (${checkX},${checkY})`);
            }
        }
    }

    // 5. Queen Aura Bonus (Adjacent allies get +1 near non-disrupted Queen) - Optional rule
    // if (attackerQueenPos && !isAttackerQueenDisrupted) {
    //     const distToQueen = Math.max(Math.abs(attackerPos.x - attackerQueenPos.x), Math.abs(attackerPos.y - attackerQueenPos.y));
    //     if (distToQueen <= 1 && attacker.type !== PIECE_TYPES.QUEEN) attackerStrength += 1;
    // }
    // if (defenderQueenPos && !isDefenderQueenDisrupted) {
    //    const distToQueen = Math.max(Math.abs(defenderPos.x - defenderQueenPos.x), Math.abs(defenderPos.y - defenderQueenPos.y));
    //    if (distToQueen <= 1 && defender.type !== PIECE_TYPES.QUEEN) defenderStrength += 1;
    // }

    console.log(`Combat: ${attacker.type}(${attackerStrength}) vs ${defender.type}(${defenderStrength})`);

    // Determine winner
    if (attackerStrength > defenderStrength) return { ...attacker }; // Attacker wins, return copy
    if (defenderStrength > attackerStrength) return { ...defender }; // Defender wins, return copy
    return null; // Mutual destruction
};

/**
 * Checks if the game is over (e.g., Queen captured, or other conditions).
 * Returns { gameOver: true, winner: playerNumber, reason: string } or { gameOver: false }.
 */
const checkGameOver = (lobby) => {
    const queen1Pos = findQueen(lobby, 1);
    const queen2Pos = findQueen(lobby, 2);

    if (!queen1Pos) return { gameOver: true, winner: 2, reason: "Player 1's Queen captured!" };
    if (!queen2Pos) return { gameOver: true, winner: 1, reason: "Player 2's Queen captured!" };

    // Add other win conditions here (e.g., reaching opponent's Throne zone)
    // Example: Check if player 1 reached player 2's throne
    const player2ThroneY = 3; // Assuming throne at [6][3]
    if (lobby.board[6][player2ThroneY] && lobby.board[6][player2ThroneY].player === 1) {
         // Could add piece type restriction (e.g., only Queen/Guard can win this way)
         // return { gameOver: true, winner: 1, reason: "Player 1 reached the opponent's Throne!" };
    }
     // Example: Check if player 2 reached player 1's throne
    const player1ThroneY = 3; // Assuming throne at [0][3]
     if (lobby.board[0][player1ThroneY] && lobby.board[0][player1ThroneY].player === 2) {
         // return { gameOver: true, winner: 2, reason: "Player 2 reached the opponent's Throne!" };
    }


    return { gameOver: false };
};

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // --- Lobby Management ---
  socket.on('createLobby', () => {
    try {
        const lobbyId = createLobby();
        const lobby = lobbies.get(lobbyId);
        lobby.players.push({ id: socket.id, playerNumber: 1 });
        socket.join(lobbyId);
        socket.lobbyId = lobbyId; // Store lobby ID on socket for easy access
        socket.playerNumber = 1; // Store player number
        socket.emit('assignPlayer', { lobbyId, playerNumber: 1 });
        console.log(`Player ${socket.id} (P1) created and joined lobby ${lobbyId}`);
        sendUpdates(lobbyId); // Send initial state
    } catch (error) {
        console.error("Error creating lobby:", error);
        socket.emit('lobbyError', 'Failed to create lobby.');
    }
  });

  socket.on('joinLobby', (lobbyId) => {
    try {
        if (!lobbies.has(lobbyId)) {
            return socket.emit('lobbyError', 'Lobby not found.');
        }
        const lobby = lobbies.get(lobbyId);
        if (lobby.players.length >= 2) {
            return socket.emit('lobbyError', 'Lobby is full.');
        }
        // Ensure player joining isn't already in the lobby
        if (lobby.players.some(p => p.id === socket.id)) {
             return socket.emit('lobbyError', 'You are already in this lobby.');
        }

        const playerNumber = 2;
        lobby.players.push({ id: socket.id, playerNumber });
        socket.join(lobbyId);
        socket.lobbyId = lobbyId;
        socket.playerNumber = playerNumber;
        socket.emit('assignPlayer', { lobbyId, playerNumber });
        console.log(`Player ${socket.id} (P${playerNumber}) joined lobby ${lobbyId}`);
        sendUpdates(lobbyId); // Update both players
    } catch (error) {
         console.error(`Error joining lobby ${lobbyId}:`, error);
         socket.emit('lobbyError', 'Failed to join lobby.');
    }
  });

  // --- Game Actions ---
  socket.on('placePiece', ({ x, y, type }) => {
    const { lobbyId, playerNumber } = socket;
    if (!lobbyId || !playerNumber || !lobbies.has(lobbyId)) return; // Basic validation
    const lobby = lobbies.get(lobbyId);

    if (lobby.gamePhase !== 'placement') {
        return socket.emit('invalidMove', { message: 'Can only place pieces during the placement phase.' });
    }
     if (lobby.readyPlayers.has(playerNumber)) {
        return socket.emit('invalidMove', { message: 'You cannot place pieces after marking yourself as ready.' });
    }

    const playerPiecesLeft = lobby.piecesLeft[playerNumber];
    if (!playerPiecesLeft || !playerPiecesLeft.hasOwnProperty(type) || playerPiecesLeft[type] <= 0) {
      return socket.emit('invalidMove', { message: `No more ${type} pieces left.` });
    }

    const placementCheck = isValidPlacement(lobby, x, y, playerNumber);
    if (placementCheck.valid) {
      const pieceId = crypto.randomUUID(); // Generate unique ID for the piece
      lobby.board[x][y] = { id: pieceId, type, player: playerNumber, visible: false };
      playerPiecesLeft[type]--; // Decrement count
      lobby.lastMoveTimestamp = Date.now();
      sendUpdates(lobbyId); // Update board for all
      // Send confirmation to the client that placed the piece
      socket.emit('placementSuccess', { x, y, type, id: pieceId });
      // No need to send piecesLeftUpdate separately, sendUpdates handles it for placement phase
    } else {
      socket.emit('invalidMove', { message: placementCheck.reason || 'Invalid placement position.' });
    }
  });

  socket.on('ready', () => {
    const { lobbyId, playerNumber } = socket;
    if (!lobbyId || !playerNumber || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);

    if (lobby.gamePhase !== 'placement') return; // Can only ready up during placement

    // Basic check: Ensure player has placed a minimum number of pieces? (Optional)
    // const piecesPlaced = lobby.board.flat().filter(p => p && p.player === playerNumber).length;
    // const totalInitialPieces = Object.values(INITIAL_PIECES).reduce((a, b) => a + b, 0);
    // if (piecesPlaced < totalInitialPieces) {
    //     return socket.emit('error', 'You must place all your pieces before being ready.');
    // }

    lobby.readyPlayers.add(playerNumber);
    io.to(lobbyId).emit('readyUpdate', Array.from(lobby.readyPlayers)); // Notify about ready status change

    if (lobby.readyPlayers.size === 2) {
      console.log(`[${lobbyId}] Both players ready. Starting game.`);
      lobby.gamePhase = 'playing';
      lobby.lastMoveTimestamp = Date.now();
      sendUpdates(lobbyId); // Send final placement and phase change
      startTurnTimer(lobbyId); // Start timer for player 1
    }
  });

  socket.on('move', ({ fromX, fromY, toX, toY }) => {
    const { lobbyId, playerNumber } = socket;
    if (!lobbyId || !playerNumber || !lobbies.has(lobbyId)) return;
    const lobby = lobbies.get(lobbyId);

    // Validate phase and turn
    if (lobby.gamePhase !== 'playing') return socket.emit('invalidMove', { message: 'Game is not in playing phase.' });
    if (playerNumber !== lobby.currentTurn) return socket.emit('invalidMove', { message: 'Not your turn.' });

    const piece = lobby.board[fromX]?.[fromY]; // Safely access piece
    if (!piece || piece.player !== playerNumber) return socket.emit('invalidMove', { message: 'Invalid piece selected.' });

    const moveCheck = isValidMove(lobby, fromX, fromY, toX, toY, piece, playerNumber);
    if (!moveCheck.valid) {
        return socket.emit('invalidMove', { message: moveCheck.reason || 'Invalid move.' });
    }

    // --- Valid Move ---
    clearTurnTimer(lobbyId); // Stop the timer for the current player
    lobby.lastMoveTimestamp = Date.now();

    const targetPiece = lobby.board[toX]?.[toY]; // Piece being moved onto

    // Case 1: Moving to an empty square
    if (!targetPiece) {
        lobby.board[toX][toY] = { ...piece }; // Move the piece (copy)
        lobby.board[fromX][fromY] = null; // Clear original square
    }
    // Case 2: Moving onto an enemy piece (Combat)
    else {
        const winnerPiece = resolveCombat(lobby, piece, targetPiece, { x: fromX, y: fromY }, { x: toX, y: toY });

        if (winnerPiece) { // There is a winner (attacker or defender)
            const loserPiece = (winnerPiece.id === piece.id) ? targetPiece : piece;
            console.log(`[${lobbyId}] Combat Winner: ${winnerPiece.type} (Player ${winnerPiece.player}), Loser: ${loserPiece.type}`);
            lobby.capturedPieces[winnerPiece.player].push(loserPiece.type); // Add loser to capturer's list
            winnerPiece.visible = true; // Winner is revealed
            lobby.board[toX][toY] = { ...winnerPiece }; // Place winner (copy)
            lobby.board[fromX][fromY] = null;
        } else { // Mutual destruction
             console.log(`[${lobbyId}] Combat Draw: ${piece.type} vs ${targetPiece.type}`);
            lobby.capturedPieces[piece.player].push(targetPiece.type); // Both are captured by opponent
            lobby.capturedPieces[targetPiece.player].push(piece.type);
            lobby.board[toX][toY] = null;
            lobby.board[fromX][fromY] = null;
        }
    }

    // --- Post-Move ---
    // Check for game over
    const gameOverState = checkGameOver(lobby);
    if (gameOverState.gameOver) {
        console.log(`[${lobbyId}] Game Over! Winner: Player ${gameOverState.winner}. Reason: ${gameOverState.reason}`);
        io.to(lobbyId).emit('gameOver', { winner: gameOverState.winner, reason: gameOverState.reason });
        // Optionally reset the lobby for a new game or just mark as finished
        // For simplicity, resetting here:
        clearTurnTimer(lobbyId); // Ensure timer is off
        // Consider delaying reset or adding a 'rematch' option
        // lobbies.delete(lobbyId); // Or delete lobby
         lobby.gamePhase = 'gameOver'; // Keep state for viewing?
         // OR Reset fully:
         // lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
         // lobby.gamePhase = 'placement';
         // lobby.readyPlayers.clear();
         // lobby.capturedPieces = { 1: [], 2: [] };
         // lobby.piecesLeft = { 1: { ...INITIAL_PIECES }, 2: { ...INITIAL_PIECES } };
         // lobby.currentTurn = 1;
         // lobby.playerTurns = { 1: 0, 2: 0 };
         sendUpdates(lobbyId); // Send final state
         return; // Stop further processing for this turn
    }

    // If game continues, switch turn
    lobby.playerTurns[playerNumber]++; // Increment turn count for the player who moved
    lobby.currentTurn = playerNumber === 1 ? 2 : 1;
    sendUpdates(lobbyId);
    startTurnTimer(lobbyId); // Start timer for the next player
  });

  socket.on('revealPiece', ({ x, y }) => {
     const { lobbyId, playerNumber } = socket;
     if (!lobbyId || !playerNumber || !lobbies.has(lobbyId)) return;
     const lobby = lobbies.get(lobbyId);

     // Validation
     if (lobby.gamePhase !== 'playing') return socket.emit('invalidMove', { message: "Can only reveal during playing phase." });
     if (playerNumber !== lobby.currentTurn) return socket.emit('invalidMove', { message: "Not your turn." });
     if (x < 0 || x >= 7 || y < 0 || y >= 7) return socket.emit('invalidMove', { message: "Invalid coordinates." });

     const targetPiece = lobby.board[x]?.[y];
     if (!targetPiece || targetPiece.player === playerNumber || targetPiece.visible) {
         return socket.emit('invalidMove', { message: "Invalid target for reveal." });
     }

     // Check for adjacent Spy belonging to the current player
     const adjacentOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // Orthogonal only
     let spyFound = false;
     for (const [dx, dy] of adjacentOffsets) {
         const checkX = x + dx;
         const checkY = y + dy;
         if (checkX >= 0 && checkX < 7 && checkY >= 0 && checkY < 7) {
             const adjacentPiece = lobby.board[checkX][checkY];
             if (adjacentPiece && adjacentPiece.player === playerNumber && adjacentPiece.type === PIECE_TYPES.SPY) {
                 spyFound = true;
                 break;
             }
         }
     }

     if (!spyFound) {
         return socket.emit('invalidMove', { message: "No adjacent Spy found to reveal the piece." });
     }

     // --- Valid Reveal ---
     console.log(`[${lobbyId}] Player ${playerNumber} revealed piece at (${x},${y}) type: ${targetPiece.type}`);
     lobby.board[x][y].visible = true; // Reveal the piece on the main board state
     lobby.lastMoveTimestamp = Date.now();

     // Notify the revealing player specifically (optional, good for sound/visual effect cue)
     socket.emit('pieceRevealed', { x, y, piece: lobby.board[x][y] });

     // Send general board update to everyone reflecting the revealed piece
     sendUpdates(lobbyId);

     // Note: Revealing doesn't end the turn or switch timers
  });


  // --- Disconnection ---
  socket.on('disconnect', (reason) => {
    console.log(`Player disconnected: ${socket.id}. Reason: ${reason}`);
    const { lobbyId, playerNumber } = socket; // Get data stored on socket

    if (lobbyId && lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      clearTurnTimer(lobbyId); // Stop timer if running

      // Remove player from lobby
      lobby.players = lobby.players.filter((p) => p.id !== socket.id);
      console.log(`[${lobbyId}] Player ${playerNumber} removed. Players remaining: ${lobby.players.length}`);

      if (lobby.players.length === 0) {
        // If no players left, delete the lobby
        lobbies.delete(lobbyId);
        console.log(`[${lobbyId}] Lobby deleted (empty).`);
      } else {
        // If one player remains, notify them and reset/end the game
        const remainingPlayer = lobby.players[0];
        const winner = remainingPlayer.playerNumber; // The remaining player wins by default
        io.to(remainingPlayer.id).emit('gameOver', { winner, reason: "Opponent disconnected."});
        io.to(remainingPlayer.id).emit('playerDisconnected'); // Generic notification

        // Reset or delete the lobby state
        lobbies.delete(lobbyId); // Simplest: delete the lobby
         console.log(`[${lobbyId}] Lobby deleted (opponent disconnected).`);
         // Alternative: Reset lobby state for the remaining player?
         /*
         lobby.board = Array(7).fill(null).map(() => Array(7).fill(null));
         lobby.currentTurn = 1;
         lobby.gamePhase = 'placement'; // Or 'waiting'
         lobby.readyPlayers.clear();
         lobby.capturedPieces = { 1: [], 2: [] };
         lobby.piecesLeft = { 1: { ...INITIAL_PIECES }, 2: { ...INITIAL_PIECES } };
         lobby.playerTurns = { 1: 0, 2: 0 };
         // No need to sendUpdates if lobby is effectively over/reset
         */
      }
    }
  });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowing connections from origin: ${clientOrigin}`);
});