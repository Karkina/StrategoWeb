import React, { useEffect, useState, useRef, useCallback } from 'react';
// Removed io import, assuming socket comes via props
import './App.css';
import Cell from './Cell'; // Import the new Cell component
import PieceInfoSideBar from './PieceInfoSideBar';
import {
  pieceIcons, initialPieces, pieceInfo, terrainTypes, generateInitialTerrain, TURN_DURATION,
  suggestedPlacements
} from './constants'; // Import from constants file

function Game({ lobbyId, player, socket }) {
  const [board, setBoard] = useState(Array(7).fill(null).map(() => Array(7).fill(null)));
  const [terrain] = useState(generateInitialTerrain); // Use generator function
  const [turn, setTurn] = useState(1);
  const [phase, setPhase] = useState('placement'); // 'placement', 'playing', 'gameOver'
  const [readyPlayers, setReadyPlayers] = useState([]);
  const [piecesLeft, setPiecesLeft] = useState({ ...initialPieces });
  const [capturedPieces, setCapturedPieces] = useState({ 1: [], 2: [] });
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_DURATION);
  const [hoveredPiece, setHoveredPiece] = useState(null); // For sidebar display
  const [selectedPieceInfo, setSelectedPieceInfo] = useState(null); // For overlay display
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [winner, setWinner] = useState(null); // Store the winner when game ends
  const [showSuggestedPlacement, setShowSuggestedPlacement] = useState(false); // For suggested placement overlay

  const timerIntervalRef = useRef(null);
  const prevCapturedLengths = useRef({ 1: 0, 2: 0 });
  const draggedItem = useRef(null); // To store info about the item being dragged
  // Helper function to clear the turn timer
  const clearTurnTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };
  // --- Sound Effects ---
  const playSound = useCallback((action) => {
    const soundFiles = {
      place: '/sounds/place.mp3',
      move: '/sounds/move.mp3',
      capture: '/sounds/capture.mp3',
      timeout: '/sounds/timeout.mp3',
      error: '/sounds/error.mp3', // Optional: sound for invalid actions
      reveal: '/sounds/reveal.mp3', // Optional: sound for spy reveal
      win: '/sounds/win.mp3', // Optional: sound for game over
      lose: '/sounds/lose.mp3' // Optional: sound for game over
    };
    // Basic check if sounds directory likely exists or fallback
    if (soundFiles[action]) {
      const audio = new Audio(soundFiles[action]);
      audio.play().catch((error) => console.warn('Audio play failed:', error)); // Use warn
    } else {
      console.warn(`Sound file for action "${action}" not found.`);
    }
  }, []); // useCallback as it doesn't depend on state/props

  // --- Piece Icon Logic ---
  // Determines the icon based on piece type, ownership, and visibility state
  const getPieceIcon = useCallback((piece) => {
    if (!piece) return '';
    // Add logic here if visibility can be affected by terrain (e.g., forests)
    // This would likely require the server to send updated 'visible' status
    // Example: if (piece.isInForest && !isAdjacent) return pieceIcons['unknown'];

    // Ensure the piece type exists in pieceIcons before trying to access it
    if (piece.player === player || piece.visible) {
      // Check if the piece type exists in pieceIcons
      if (pieceIcons[piece.type]) {
        return pieceIcons[piece.type];
      } else {
        console.warn(`Piece type "${piece.type}" not found in pieceIcons`);
        return pieceIcons['unknown'];
      }
    }
    return pieceIcons['unknown'];
  }, [player]); // Depends on the current player

  // --- Socket Event Handlers ---
  useEffect(() => {
    // Clear any existing interval when component mounts or socket changes
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);



    socket.on('boardUpdate', (newBoard) => setBoard(newBoard));
    socket.on('turnUpdate', (newTurn) => setTurn(newTurn));
    socket.on('piecesLeftUpdate', (newPiecesLeft) => setPiecesLeft(newPiecesLeft));
    socket.on('phaseUpdate', (newPhase) => {
      setPhase(newPhase);
      if (newPhase === 'placement') {
        setPiecesLeft({ ...initialPieces });
        setReadyPlayers([]);
        setWinner(null); // Reset winner
        setCapturedPieces({ 1: [], 2: [] }); // Reset captured pieces
      }
      // Reset timer if phase changes back to playing (e.g., after a reset)
      if (newPhase === 'playing') {
        setTurnTimeLeft(TURN_DURATION);
      } else {
        // Clear timer if not in playing phase
        clearTurnTimer();
      }
    });

    // Add event for successful piece placement
    socket.on('placementSuccess', (data) => {
      console.log('Placement successful:', data);
      // If we're doing automatic placement, continue with the next piece
      if (window.autoPlacementInProgress && window.autoPlacementQueue && window.autoPlacementQueue.length > 0) {
        const nextPlacement = window.autoPlacementQueue.shift();
        if (nextPlacement) {
          setTimeout(() => {
            socket.emit('placePiece', nextPlacement);
          }, 100);
        } else {
          console.log('Auto placement complete');
          window.autoPlacementInProgress = false;
        }
      }
    });
    socket.on('readyUpdate', (players) => setReadyPlayers(players));
    socket.on('capturedUpdate', (captured) => setCapturedPieces(captured));
    socket.on('gameOver', ({ winner: gameWinner, reason }) => {
      setPhase('gameOver');
      setWinner(gameWinner);
      playSound(gameWinner === player ? 'win' : 'lose');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); // Stop timer on game over
      // Consider showing reason in overlay
      alert(`Game Over! ${reason}. Player ${gameWinner} wins!`); // Provide more context
    });
    socket.on('timeout', ({ player: timedOutPlayer }) => {
      if (timedOutPlayer === player) {
        playSound('timeout');
        // Maybe show a less intrusive notification than alert
        console.log("Your turn timed out!");
      }
      // Timer logic is now handled within the timer useEffect
    });
    socket.on('pieceRevealed', ({ x, y, piece }) => {
      // Update the specific piece on the board with revealed info
      setBoard(prevBoard => {
        const newBoard = prevBoard.map(row => [...row]);
        if (newBoard[x] && newBoard[x][y]) {
          newBoard[x][y] = { ...newBoard[x][y], type: piece.type, visible: true };
        }
        return newBoard;
      });
      playSound('reveal');
    });
    socket.on('invalidMove', ({ message }) => {
      alert(`Invalid Move: ${message}`); // Give feedback
      playSound('error');
    });

    // Cleanup listeners on component unmount
    return () => {
      socket.off('boardUpdate');
      socket.off('turnUpdate');
      socket.off('phaseUpdate');
      socket.off('readyUpdate');
      socket.off('capturedUpdate');
      socket.off('gameOver');
      socket.off('timeout');
      socket.off('pieceRevealed');
      socket.off('invalidMove');
      socket.off('placementSuccess'); // Don't forget to remove the new event listener
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); // Ensure timer cleared on unmount
    };
  }, [player, socket, playSound]); // Add playSound dependency

  // --- Turn Timer Logic ---
  useEffect(() => {
    if (phase === 'playing') {
      // Clear previous interval if dependencies change
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      // Only start timer if it's the current player's turn
      if (turn === player) {
        setTurnTimeLeft(TURN_DURATION); // Reset timer at start of turn

        timerIntervalRef.current = setInterval(() => {
          setTurnTimeLeft((prev) => {
            if (prev <= 1) {
              clearInterval(timerIntervalRef.current);
              // Server should handle timeout logic; client just reflects time
              // Client-side timeout alert was removed as server handles consequences
              console.log("Time expired (client view)");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        // If it's not the player's turn, show full duration or reset visually
        setTurnTimeLeft(TURN_DURATION);
      }

      // Cleanup interval on change of dependencies or unmount
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    } else {
      // If not in playing phase, clear timer
      clearTurnTimer();
    }
  }, [turn, phase, player]); // Rerun when turn, phase, or player changes

  // --- Capture Sound Effect ---
  useEffect(() => {
    const currentTotalCaptures = capturedPieces[1].length + capturedPieces[2].length;
    const previousTotalCaptures = prevCapturedLengths.current[1] + prevCapturedLengths.current[2];

    if (currentTotalCaptures > previousTotalCaptures) {
      playSound('capture');
    }
    // Update previous lengths reference
    prevCapturedLengths.current = {
      1: capturedPieces[1].length,
      2: capturedPieces[2].length,
    };
  }, [capturedPieces, playSound]); // Rerun when capturedPieces changes

  // --- Drag and Drop Handlers ---

  // Dragging a piece from the reserve (Placement Phase)
  const handleDragStartPiece = (e, type) => {
    if (phase !== 'placement') return;
    draggedItem.current = { type, source: 'reserve' };
    e.dataTransfer.setData('pieceType', type);
    // Optional: Add a dragging class for visual feedback
    e.currentTarget.classList.add('dragging');
  };

  // Dragging a piece from the board (Playing Phase)
  const handleDragStartBoard = (e, x, y, piece) => {
    if (phase !== 'playing' || piece.player !== player || turn !== player || terrainTypes[terrain[x][y]].impassable) {
      e.preventDefault(); // Prevent drag if conditions not met
      return;
    }
    draggedItem.current = { piece, fromX: x, fromY: y, source: 'board' };
    e.dataTransfer.setData('fromX', x.toString());
    e.dataTransfer.setData('fromY', y.toString());
    e.dataTransfer.setData('pieceId', piece.id); // Assuming pieces have unique IDs from server
    e.currentTarget.classList.add('dragging');
    // TODO: Optionally request valid moves from server here and store them
    // socket.emit('getValidMoves', { x, y });
  };

  // When dragging ends (clean up dragging class)
  const handleDragEnd = (e) => {
    if (draggedItem.current) {
      const element = document.querySelector('.dragging');
      if (element) element.classList.remove('dragging');
      draggedItem.current = null; // Clear dragged item ref
      // Clear any temporary valid move highlights if they were set
      document.querySelectorAll('.valid-move-hover').forEach(el => el.classList.remove('valid-move-hover'));
    }
  };

  // Drop onto a board cell
  const handleDrop = (e, toX, toY) => {
    e.preventDefault();
    document.querySelectorAll('.valid-move-hover').forEach(el => el.classList.remove('valid-move-hover')); // Clear hover highlights
    const targetCell = e.currentTarget;
    targetCell.classList.remove('drag-over'); // Remove drag over indicator

    const pieceType = e.dataTransfer.getData('pieceType');
    const fromXStr = e.dataTransfer.getData('fromX');
    const fromYStr = e.dataTransfer.getData('fromY');

    // Check for terrain impassability first
    if (terrainTypes[terrain[toX][toY]].impassable) {
      playSound('error');
      console.log("Cannot drop on impassable terrain.");
      handleDragEnd(e); // Clean up drag state
      return;
    }

    // Placement Phase Drop
    if (phase === 'placement' && pieceType && draggedItem.current?.source === 'reserve') {
      console.log(`Attempting to place ${pieceType} at (${toX}, ${toY})`);
      if (isValidPlacement(toX, toY) && piecesLeft[pieceType] > 0) {
        // Send placement to server
        socket.emit('placePiece', { x: toX, y: toY, type: pieceType });
        playSound('place');

        // Optimistic UI update (will be overridden by server response)
        setBoard(prevBoard => {
          const newBoard = prevBoard.map(row => [...row]);
          newBoard[toX][toY] = {
            type: pieceType,
            player,
            visible: false,
            id: `${player}-${pieceType}-${Date.now()}` // Temporary ID
          };
          return newBoard;
        });

        // Optimistic update of pieces left
        setPiecesLeft(prev => ({
          ...prev,
          [pieceType]: prev[pieceType] - 1
        }));

        // Server response will update piecesLeft via 'piecesLeftUpdate'
      } else {
        playSound('error');
        console.log("Invalid placement location or no pieces left.");
      }
    }
    // Playing Phase Drop
    else if (phase === 'playing' && fromXStr && fromYStr && draggedItem.current?.source === 'board') {
      const fromX = parseInt(fromXStr, 10);
      const fromY = parseInt(fromYStr, 10);

      // Basic client check: ensure it's the player's turn
      if (turn === player) {
        socket.emit('move', { fromX, fromY, toX, toY });
        // Optimistic UI update can be tricky with reveals/captures, rely on server 'boardUpdate'
        // playSound('move'); // Play sound optimistically, server confirms success/failure
        // Add temporary 'moving' animation class - Requires CSS for .moving
        const cellElement = document.querySelector(`.cell[data-x="${toX}"][data-y="${toY}"]`);
        if (cellElement && !board[toX][toY]) { // Only animate if moving to empty square visually
          cellElement.classList.add('moving-visual');
          setTimeout(() => cellElement.classList.remove('moving-visual'), 500);
        }
      } else {
        playSound('error');
        console.log("Not your turn.");
      }
    }
    handleDragEnd(e); // Clean up drag state
  };

  // Allow drop event
  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.currentTarget.classList.add('drag-over'); // Indicate potential drop target
  };

  // Highlight potential drop zones on enter
  const handleDragEnter = (e, x, y) => {
    e.preventDefault();
    const targetCell = e.currentTarget;
    targetCell.classList.add('drag-over');

    if (!draggedItem.current || terrainTypes[terrain[x][y]].impassable) return;

    // Highlight valid placement zones
    if (phase === 'placement' && draggedItem.current.source === 'reserve' && isValidPlacement(x, y)) {
      // The Cell component already adds 'drop-valid' based on isPlacementZone prop
      // So no extra class needed here for that.
    }
    // Highlight potential move targets (simple hover, not strict validation)
    else if (phase === 'playing' && draggedItem.current.source === 'board') {
      // Avoid highlighting the starting cell
      if (!(draggedItem.current.fromX === x && draggedItem.current.fromY === y)) {
        targetCell.classList.add('valid-move-hover');
      }
    }
  };

  // Remove highlights on leave
  const handleDragLeave = (e, x, y) => {
    e.preventDefault();
    const targetCell = e.currentTarget;
    targetCell.classList.remove('drag-over');
    targetCell.classList.remove('valid-move-hover'); // Remove move hover highlight
    // Note: 'drop-valid' for placement is handled by the Cell component based on props
  };

  // --- Placement Logic ---
  // Checks if a cell (x, y) is valid for the current player during placement
  const isValidPlacement = useCallback((x, y) => {
    // Check if cell is already occupied or is impassable terrain
    if (board[x]?.[y] || terrainTypes[terrain[x][y]].impassable) {
      return false;
    }
    // Player 1 (bottom) can place pieces in the bottom two rows (5-6)
    if (player === 1 && (x === 5 || x === 6)) return true;
    // Player 2 (top) can place pieces in the top two rows (0-1)
    if (player === 2 && (x === 0 || x === 1)) return true;
    return false;
  }, [player, board, terrain]); // Depends on player, board state, and terrain layout

  // --- Placement Functions ---
  const applySuggestedPlacement = () => {
    if (!suggestedPlacements[player]) return;

    // First, clear all existing pieces for this player
    clearPlacement();

    // Create a queue of placements to process
    window.autoPlacementQueue = suggestedPlacements[player].map(({ type, x, y }) => ({ type, x, y }));
    window.autoPlacementInProgress = true;

    // Start the placement process by sending the first piece
    if (window.autoPlacementQueue.length > 0) {
      const firstPlacement = window.autoPlacementQueue.shift();
      console.log(`Starting auto placement with ${firstPlacement.type} at (${firstPlacement.x}, ${firstPlacement.y})`);
      socket.emit('placePiece', firstPlacement);
    }

    // Hide the suggested placement overlay
    setShowSuggestedPlacement(false);

    // Play a sound
    playSound('place');
  };

  const clearPlacement = () => {
    setBoard(prevBoard => {
      const updatedBoard = prevBoard.map(row => [...row]);

      // Remove all pieces for this player
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          if (updatedBoard[x][y] && updatedBoard[x][y].player === player) {
            updatedBoard[x][y] = null;
          }
        }
      }

      return updatedBoard;
    });

    // Reset pieces left to initial values
    setPiecesLeft({ ...initialPieces });

    // Play a sound
    playSound('error');
  };

  const toggleSuggestedPlacement = () => {
    setShowSuggestedPlacement(prev => !prev);
  };

  // --- Player Actions ---
  const handleReady = () => {
    // Optional: Add check if player has placed all required pieces
    socket.emit('ready');
  };

  // --- Mouse Hover for Sidebar ---
  const handleMouseEnter = (piece) => {
    if (piece && pieceInfo[piece.type]) { // Ensure piece type is valid
      // Show full info only for own pieces or revealed enemy pieces
      if (piece.player === player || piece.visible) {
        setHoveredPiece(pieceInfo[piece.type]);
      } else {
        // Show basic unknown info for hidden enemy pieces
        setHoveredPiece({ name: 'Unknown Piece', description: 'Enemy unit. Type is hidden.', moves: '?', type: 'unknown' });
      }
    }
  };

  const handleMouseLeave = () => {
    setHoveredPiece(null);
  };

  // --- Context Menu (Right Click) ---
  const handleContextMenu = (e, piece, x, y) => {
    e.preventDefault();
    if (phase !== 'playing') return; // Context menu actions only during play

    // If clicking an adjacent enemy piece with own Spy selected/nearby (server should validate adjacency)
    const adjacentCells = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
    ];
    let spyIsAdjacent = false;
    adjacentCells.forEach(([ax, ay]) => {
      if (ax >= 0 && ax < 7 && ay >= 0 && ay < 7 && board[ax][ay]?.type === 'spy' && board[ax][ay]?.player === player) {
        spyIsAdjacent = true;
      }
    });

    if (piece && piece.player !== player && !piece.visible && spyIsAdjacent && turn === player) {
      // Request server to reveal the piece
      socket.emit('revealPiece', { x, y });
    }
    // If clicking any piece (own or revealed enemy), show its info in the overlay
    else if (piece && (piece.player === player || piece.visible) && pieceInfo[piece.type]) {
      setSelectedPieceInfo(pieceInfo[piece.type]); // Use the info from constants
      setOverlayVisible(true);
    }
    // If clicking own hidden piece (shouldn't happen often, but maybe for debug)
    else if (piece && piece.player === player && !piece.visible && pieceInfo[piece.type]) {
      setSelectedPieceInfo(pieceInfo[piece.type]);
      setOverlayVisible(true);
    }
    // If clicking unknown enemy piece without spy nearby
    else if (piece && piece.player !== player && !piece.visible) {
      setSelectedPieceInfo({ name: 'Unknown Piece', description: 'Enemy unit. Type is hidden. A Spy might reveal it.', moves: '?', type: 'unknown' });
      setOverlayVisible(true);
    }
  };

  // --- Render Logic ---
  return (
    <div className="game-container">
      <h1 className="game-title">Mini-Stratego - Lobby: {lobbyId} (You are Player {player})</h1>

      {/* Placement Phase UI */}
      {phase === 'placement' && (
        <div className="placement-controls">
          <h2>Phase de Placement</h2>
          <p>Placez vos pièces sur les cases surlignées. Cliquez-droit sur une pièce pour plus d'informations.</p>

          <div className="placement-actions">
            <button
              className="placement-button info"
              onClick={toggleSuggestedPlacement}
              title="Voir la disposition suggérée"
            >
              <span>📋</span> Voir disposition suggérée
            </button>
            <button
              className="placement-button primary"
              onClick={applySuggestedPlacement}
              title="Appliquer automatiquement la disposition suggérée"
            >
              <span>✅</span> Placement automatique
            </button>
            <button
              className="placement-button danger"
              onClick={clearPlacement}
              title="Effacer toutes vos pièces placées"
            >
              <span>🗑️</span> Tout effacer
            </button>
          </div>

          <div className="reserve">
            {Object.entries(piecesLeft)
              // Filter out piece types with count 0
              .filter(([_, count]) => count > 0)
              .map(([type, count]) => (
                <div
                  key={type}
                  draggable={count > 0} // Only draggable if count > 0
                  onDragStart={(e) => handleDragStartPiece(e, type)}
                  onDragEnd={handleDragEnd} // Add drag end handler
                  onContextMenu={(e) => { // Allow right-click for info during placement
                    e.preventDefault();
                    if (pieceInfo[type]) {
                      setSelectedPieceInfo(pieceInfo[type]);
                      setOverlayVisible(true);
                    }
                  }}
                  className="piece-draggable"
                  title={pieceInfo[type]?.name} // Add tooltip
                >
                  <span className="piece-icon">{pieceIcons[type]}</span>
                  <span className="piece-count">{count}</span>
                </div>
              ))}
          </div>

          <button
            className="placement-button primary"
            onClick={handleReady}
            disabled={readyPlayers.includes(player)}
            style={{ marginTop: '20px' }}
          >
            <span>{readyPlayers.includes(player) ? '⏳' : '✓'}</span>
            {readyPlayers.includes(player) ? 'En attente de l\'adversaire...' : 'Prêt'}
          </button>

          <p className="ready-players">Joueurs prêts: {readyPlayers.length} / 2</p>
        </div>
      )}

      {/* Playing/Game Over Phase UI */}
      <div className={`game-layout ${phase === 'placement' ? 'layout-placement' : 'layout-playing'}`}>
        {/* Board Area */}
        <div className="board-container">
          <div className="board">
            {board.map((row, x) =>
              row.map((piece, y) => (
                <Cell
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  terrainCode={terrain[x][y]}
                  piece={piece}
                  player={player}
                  turn={turn}
                  phase={phase}
                  getPieceIcon={getPieceIcon}
                  handleDrop={handleDrop}
                  handleDragOver={handleDragOver}
                  handleDragStart={handleDragStartBoard} // Use board drag start
                  handleDragEnd={handleDragEnd} // Pass drag end
                  handleDragEnter={handleDragEnter}
                  handleDragLeave={handleDragLeave}
                  handleContextMenu={handleContextMenu}
                  handleMouseEnter={handleMouseEnter}
                  handleMouseLeave={handleMouseLeave}
                  // Calculate if the cell is a valid placement zone for the current player
                  isPlacementZone={phase === 'placement' && isValidPlacement(x, y)}
                />
              ))
            )}
          </div>
        </div>

        {/* Sidebar Area - Only shown during playing/game over phase */}
        {(phase === 'playing' || phase === 'gameOver') && (
          <PieceInfoSideBar
            player={player}
            turn={turn}
            turnTimeLeft={turnTimeLeft}
            capturedPieces={capturedPieces} // Pass captured pieces state
            pieceInfo={pieceInfo} // Pass all piece info
            pieceIcons={pieceIcons} // Pass icons
            hoveredPiece={hoveredPiece} // Pass hovered piece info object
            isGameOver={phase === 'gameOver'} // Indicate if game is over
            winner={winner} // Pass winner info
          />
        )}
      </div>

      {/* Piece Info Overlay */}
      {overlayVisible && selectedPieceInfo && (
        <div className="overlay">
          <div className="overlay-content">
            <h2>{selectedPieceInfo.name} {selectedPieceInfo.type !== 'unknown' ? `(${pieceIcons[selectedPieceInfo.type]})` : ''}</h2>
            <p>{selectedPieceInfo.description}</p>
            <p><strong>Moves:</strong> {selectedPieceInfo.moves}</p>
            <button onClick={() => setOverlayVisible(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Game Over Overlay (Alternative to alert) */}
      {phase === 'gameOver' && winner !== null && (
        <div className="overlay game-over-overlay">
          <div className="overlay-content">
            <h2>Game Over!</h2>
            <p>Player {winner} is victorious!</p>
            {/* Optional: Add button to return to lobby or start new game */}
            {/* <button onClick={() => window.location.reload()}>Play Again?</button> */}
            <button onClick={() => setOverlayVisible(false)}>Close</button> {/* Simple close */}
          </div>
        </div>
      )}
      {showSuggestedPlacement && suggestedPlacements[player] && (
        <div className="overlay suggested-placement-overlay">
          <div className="overlay-content">
            <h2>Disposition Suggérée</h2>
            <p>Voici une disposition stratégique recommandée pour vos pièces :</p>

            <div className="suggested-placement-grid">
              {suggestedPlacements[player].map((placement, index) => (
                <div className="suggested-placement-item" key={index}>
                  <span className="piece-icon">{pieceIcons[placement.type]}</span>
                  <span className="piece-name">{pieceInfo[placement.type]?.name}</span>
                </div>
              ))}
            </div>

            <p>Cette disposition place votre Reine au centre avec des Gardes pour la protéger,
              les Cavaliers sur les flancs pour attaquer, et le Tacticien stratégiquement placé
              pour booster vos autres pièces.</p>

            <div className="suggested-placement-buttons">
              <button className="placement-button primary" onClick={applySuggestedPlacement}>
                <span>✅</span> Appliquer
              </button>
              <button className="placement-button" onClick={toggleSuggestedPlacement}>
                <span>❌</span> Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;