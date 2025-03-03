import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import PieceInfoSideBar from './PieceInfoSideBar';

const socket = io('http://localhost:3000');

const pieceIcons = {
    flag: '🚩',
    marshal: '🎖️',
    spy: '🕵️',
    scout: '🏃',
    miner: '⛏️',
    bomb: '💣',
    unknown: '❓',
};
const initialPieces = {
    flag: 1,
    marshal: 1,
    spy: 1,
    scout: 2,
    miner: 2,
    bomb: 2,
};

const pieceInfo = {
    flag: { name: 'Flag', description: 'Capture this to win!', moves: 'Cannot move' },
    marshal: { name: 'Marshal', description: 'Strongest piece, rank 10', moves: 'One square' },
    spy: { name: 'Spy', description: 'Can defeat Marshal if attacking', moves: 'One square' },
    scout: { name: 'Scout', description: 'Fast mover, rank 2', moves: 'Any straight line' },
    miner: { name: 'Miner', description: 'Defuses bombs, rank 3', moves: 'One square' },
    bomb: { name: 'Bomb', description: 'Destroys most attackers', moves: 'Cannot move' },
};

function Game({ lobbyId, player, socket }) {
    const [board, setBoard] = useState(Array(7).fill(null).map(() => Array(7).fill(null)));
    const [terrain] = useState(() => {
        const grid = Array(7).fill(null).map(() => Array(7).fill(0));
        grid[3][0] = 1; grid[3][2] = 1; grid[3][4] = 1; grid[3][6] = 1; // Lakes
        grid[3][1] = 0; grid[3][3] = 0; grid[3][5] = 0; // Open middle
        grid[2][2] = 1; grid[2][4] = 1; grid[4][2] = 1; grid[4][4] = 1; // Additional lakes
        grid[0][0] = 2; grid[0][6] = 2; grid[6][0] = 2; grid[6][6] = 2; // Corners
        return grid;
    });
    const [turn, setTurn] = useState(1);
    const [phase, setPhase] = useState('placement');
    const [readyPlayers, setReadyPlayers] = useState([]);
    const [piecesLeft, setPiecesLeft] = useState({ ...initialPieces });
    const [capturedPieces, setCapturedPieces] = useState({ 1: [], 2: [] });
    const [turnTimeLeft, setTurnTimeLeft] = useState(30);
    const [hoveredPiece, setHoveredPiece] = useState(null);
    const prevCapturedLengths = useRef({ 1: 0, 2: 0 });
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [selectedPiece, setSelectedPiece] = useState(null);

    // Custom function to get piece icon based on player
    const getPieceIcon = (piece) => {
        if (!piece) return '';
        if (piece.player === 1 && piece.type === 'scout') return 'S'; // Player 1 scouts are "S"
        return pieceIcons[piece.type];
    };

    const handleContextMenu = (e, piece) => {
        e.preventDefault();
        if (piece) {
            setSelectedPiece(piece);
            setOverlayVisible(true);
        }
    };

    const playSound = (action) => {
        const soundFiles = {
            place: '/sounds/place.mp3',
            move: '/sounds/move.mp3',
            capture: '/sounds/capture.mp3',
            timeout: '/sounds/timeout.mp3',
        };
        const audio = new Audio(soundFiles[action]);
        audio.play().catch((error) => console.log('Audio play failed:', error));
    };

    useEffect(() => {
        socket.on('boardUpdate', (newBoard) => setBoard(newBoard));
        socket.on('turnUpdate', (newTurn) => setTurn(newTurn));
        socket.on('piecesLeftUpdate', (newPiecesLeft) => setPiecesLeft(newPiecesLeft));
        socket.on('phaseUpdate', (newPhase) => {
            setPhase(newPhase);
            if (newPhase === 'placement') {
                setPiecesLeft({ ...initialPieces });
                setReadyPlayers([]);
            }
        });
        socket.on('readyUpdate', (players) => setReadyPlayers(players));
        socket.on('capturedUpdate', (captured) => setCapturedPieces(captured));
        socket.on('gameOver', (winner) => alert(`Game Over! Player ${winner} wins!`));
        socket.on('timeout', ({ player: timedOutPlayer }) => {
            if (timedOutPlayer === player) {
                playSound('timeout');
            }
        });
        return () => {
            socket.off('boardUpdate');
            socket.off('turnUpdate');
            socket.off('phaseUpdate');
            socket.off('readyUpdate');
            socket.off('capturedUpdate');
            socket.off('gameOver');
            socket.off('timeout');
        };
    }, [player, socket]);

    useEffect(() => {
        if (phase === 'playing' && turn === player) {
            setTurnTimeLeft(30);
            const timer = setInterval(() => {
                setTurnTimeLeft((prev) => {
                    if (prev <= 3) {
                        clearInterval(timer);
                        playSound('timeout');
                        alert("Time's up!");
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [turn, phase, player]);

    useEffect(() => {
        if (
            capturedPieces[1].length > prevCapturedLengths.current[1] ||
            capturedPieces[2].length > prevCapturedLengths.current[2]
        ) {
            playSound('capture');
        }
        prevCapturedLengths.current = {
            1: capturedPieces[1].length,
            2: capturedPieces[2].length,
        };
    }, [capturedPieces]);

    const handleDragStartPiece = (e, type) => {
        e.dataTransfer.setData('pieceType', type);
    };

    const handleDragStart = (e, x, y) => {
        if (phase === 'playing' && board[x][y]?.player === player && turn === player && terrain[x][y] !== 1) {
            e.dataTransfer.setData('fromX', x);
            e.dataTransfer.setData('fromY', y);
        }
    };

    const handleDrop = (e, toX, toY) => {
        e.preventDefault();
        const pieceType = e.dataTransfer.getData('pieceType');
        const fromX = e.dataTransfer.getData('fromX');
        const fromY = e.dataTransfer.getData('fromY');

        if (phase === 'placement' && pieceType) {
            if (isValidPlacement(toX, toY) && piecesLeft[pieceType] > 0 && terrain[toX][toY] !== 1) {
                socket.emit('placePiece', { x: toX, y: toY, type: pieceType });
                playSound('place');
                e.target.classList.remove('drop-valid');
            }
        } else if (phase === 'playing' && fromX && fromY) {
            const fromXInt = parseInt(fromX);
            const fromYInt = parseInt(fromY);
            if (turn === player && terrain[toX][toY] !== 1) {
                socket.emit('move', { fromX: fromXInt, fromY: fromYInt, toX, toY });
                playSound('move');
                const cell = document.querySelector(`.cell[data-x="${toX}"][data-y="${toY}"]`);
                if (cell) {
                    cell.classList.add('moving');
                    setTimeout(() => cell.classList.remove('moving'), 500);
                }
            }
        }
    };

    const handleDragOver = (e) => e.preventDefault();

    const handleDragEnter = (e, x, y) => {
        if (phase === 'placement' && isValidPlacement(x, y) && terrain[x][y] !== 1) {
            e.target.classList.add('drop-valid');
        }
    };

    const handleDragLeave = (e) => e.target.classList.remove('drop-valid');

    const isValidPlacement = (x, y) => {
        if (player === 1 && x <= 2 && !board[x][y]) return true;
        if (player === 2 && x >= 4 && !board[x][y]) return true;
        return false;
    };

    const handleReady = () => socket.emit('ready');

    const handleMouseEnter = (piece) => {
        if (piece) setHoveredPiece(piece);
    };

    const handleMouseLeave = () => setHoveredPiece(null);

    return (
        <div className="game-container">
            <h1>Mini-Stratego - Lobby: {lobbyId}</h1>
            {phase === 'placement' && (
                <div>
                    <p>Placement Phase: Drag a piece to the board</p>
                    <div className="reserve">
                        {Object.entries(piecesLeft).map(([type, count]) =>
                            count > 0 && (
                                <div
                                    key={type}
                                    draggable
                                    onDragStart={(e) => handleDragStartPiece(e, type)}
                                    onContextMenu={(e) => handleContextMenu(e, { type })}
                                    className="piece-draggable"
                                >
                                    {pieceIcons[type]} x{count}
                                </div>
                            )
                        )}
                    </div>
                    <button onClick={handleReady}>Ready</button>
                    <p>Ready Players: {readyPlayers.join(', ')}</p>
                </div>
            )}
            {phase === 'playing' && (<PieceInfoSideBar
                player={player}
                capturedPieces={capturedPieces}
                pieceInfo={pieceInfo}
                pieceIcons={pieceIcons}
                turn={turn}
                turnTimeLeft={turnTimeLeft}
                hoveredPiece={hoveredPiece}
            />)}
            <div className="game-layout">
                <div className="board-container">
                    <div className="board">
                        {terrain.map((row, x) =>
                            row.map((terrainType, y) => (
                                <div
                                    key={`${x}-${y}`}
                                    className={`cell terrain-${terrainType} ${board[x][y] ? `player-${board[x][y].player}` : ''}`}
                                    draggable={phase === 'playing' && board[x][y]?.player === player && turn === player && terrainType !== 1}
                                    onDragStart={(e) => handleDragStart(e, x, y)}
                                    onDrop={(e) => handleDrop(e, x, y)}
                                    onDragOver={handleDragOver}
                                    onDragEnter={(e) => handleDragEnter(e, x, y)}
                                    onDragLeave={handleDragLeave}
                                    onMouseEnter={() => handleMouseEnter(board[x][y])}
                                    onMouseLeave={handleMouseLeave}
                                    data-x={x}
                                    data-y={y}
                                >
                                    {board[x][y] ? getPieceIcon(board[x][y]) : ''}
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {overlayVisible && (
                <div className="overlay">
                    <h2>{pieceInfo[selectedPiece.type].name}</h2>
                    <p>{pieceInfo[selectedPiece.type].description}</p>
                    <p><strong>Moves:</strong> {pieceInfo[selectedPiece.type].moves}</p>
                    <button onClick={() => setOverlayVisible(false)}>Close</button>
                </div>
            )}
        </div>
    );
}

export default Game;