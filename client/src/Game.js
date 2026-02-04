import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3000');

const FACTIONS = {
    humans: {
        name: 'Humans',
        units: [
            { type: 'banner', name: 'Banner', role: 'flag', count: 1, icon: '🚩' },
            { type: 'commander', name: 'Commander', role: 'marshal', count: 1, icon: '🛡️' },
            { type: 'spy', name: 'Spy', role: 'spy', count: 1, icon: '🕵️' },
            { type: 'ranger', name: 'Ranger', role: 'scout', count: 2, icon: '🏹' },
            { type: 'sapper', name: 'Sapper', role: 'miner', count: 2, icon: '⛏️' },
            { type: 'trap', name: 'Trap', role: 'bomb', count: 2, icon: '🧨' },
        ],
    },
    orcs: {
        name: 'Orcs',
        units: [
            { type: 'totem', name: 'Totem', role: 'flag', count: 1, icon: '🏴' },
            { type: 'warlord', name: 'Warlord', role: 'marshal', count: 1, icon: '⚔️' },
            { type: 'stalker', name: 'Stalker', role: 'spy', count: 1, icon: '🥷' },
            { type: 'raider', name: 'Raider', role: 'scout', count: 2, icon: '🐺' },
            { type: 'demolisher', name: 'Demolisher', role: 'miner', count: 2, icon: '🪓' },
            { type: 'bomb', name: 'Bomb', role: 'bomb', count: 2, icon: '💣' },
        ],
    },
};

const buildPieceIcons = () => {
    const icons = { unknown: '❓' };
    Object.values(FACTIONS).forEach((faction) => {
        faction.units.forEach((unit) => {
            icons[unit.type] = unit.icon;
        });
    });
    return icons;
};

const pieceIcons = buildPieceIcons();

const buildPiecesLeft = (units) => {
    const pieces = {};
    units.forEach((unit) => {
        pieces[unit.type] = unit.count;
    });
    return pieces;
};

function Game({ lobbyId, player, socket, factionId, rules }) {
    const [board, setBoard] = useState(Array(7).fill(null).map(() => Array(7).fill(null)));
    const [terrain, setTerrain] = useState(() => {
        const grid = Array(7).fill(null).map(() => Array(7).fill(0));
        grid[3][0] = 1; grid[3][2] = 1; grid[3][4] = 1; grid[3][6] = 1;
        grid[3][1] = 0; grid[3][3] = 0; grid[3][5] = 0;
        grid[2][2] = 1; grid[2][4] = 1; grid[4][2] = 1; grid[4][4] = 1;
        grid[0][0] = 2; grid[0][6] = 2; grid[6][0] = 2; grid[6][6] = 2;
        return grid;
    });
    const [turn, setTurn] = useState(1);
    const [phase, setPhase] = useState('placement');
    const [readyPlayers, setReadyPlayers] = useState([]);
    const [playerFactionId, setPlayerFactionId] = useState(factionId || 'humans');
    const [factionUnits, setFactionUnits] = useState(FACTIONS[factionId || 'humans'].units);
    const [piecesLeft, setPiecesLeft] = useState(buildPiecesLeft(FACTIONS[factionId || 'humans'].units));
    const [capturedPieces, setCapturedPieces] = useState({ 1: [], 2: [] });
    const [rulesState, setRulesState] = useState(rules || { factionAbilities: false });
    const [abilityUsed, setAbilityUsed] = useState({ marshalSwap: false, warlordRoar: false });

    useEffect(() => {
        if (rules) {
            setRulesState(rules);
        }
    }, [rules]);

    useEffect(() => {
        socket.on('boardUpdate', (newBoard) => setBoard(newBoard));
        socket.on('turnUpdate', (newTurn) => setTurn(newTurn));
        socket.on('piecesLeftUpdate', (newPiecesLeft) => {
            setPiecesLeft(newPiecesLeft);
        });
        socket.on('rulesInfo', (rulesInfo) => {
            if (rulesInfo) {
                setRulesState(rulesInfo);
            }
        });
        socket.on('abilityUpdate', ({ rules, abilityUsed }) => {
            if (rules) {
                setRulesState(rules);
            }
            if (abilityUsed) {
                setAbilityUsed(abilityUsed);
            }
        });
        socket.on('factionInfo', ({ factionId: incomingFactionId, units }) => {
            const normalizedFactionId = incomingFactionId && FACTIONS[incomingFactionId] ? incomingFactionId : 'humans';
            const normalizedUnits = units && units.length ? units : FACTIONS[normalizedFactionId].units;
            setPlayerFactionId(normalizedFactionId);
            setFactionUnits(normalizedUnits);
            setPiecesLeft(buildPiecesLeft(normalizedUnits));
        });
        socket.on('terrainUpdate', ({ x, y, terrainType }) => {
            setTerrain((prev) => {
                const next = prev.map((row) => row.slice());
                if (next[x] && typeof next[x][y] !== 'undefined') {
                    next[x][y] = terrainType;
                }
                return next;
            });
        });
        socket.on('terrainReset', (newTerrain) => {
            if (Array.isArray(newTerrain)) {
                setTerrain(newTerrain.map((row) => row.slice()));
            }
        });
        socket.on('phaseUpdate', (newPhase) => {
            setPhase(newPhase);
            if (newPhase === 'placement') {
                if (factionUnits.length) {
                    setPiecesLeft(buildPiecesLeft(factionUnits));
                }
                setReadyPlayers([]);
            }
        });
        socket.on('readyUpdate', (players) => setReadyPlayers(players));
        socket.on('capturedUpdate', (captured) => setCapturedPieces(captured));
        socket.on('gameOver', (winner) => alert(`Game Over! Player ${winner} wins!`));
        return () => {
            socket.off('boardUpdate');
            socket.off('turnUpdate');
            socket.off('phaseUpdate');
            socket.off('readyUpdate');
            socket.off('capturedUpdate');
            socket.off('gameOver');
            socket.off('factionInfo');
            socket.off('rulesInfo');
            socket.off('abilityUpdate');
            socket.off('terrainUpdate');
            socket.off('terrainReset');
        };
    }, [socket, factionUnits]);

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
                e.target.classList.remove('drop-valid');

            }
        } else if (phase === 'playing' && fromX && fromY) {
            const fromXInt = parseInt(fromX);
            const fromYInt = parseInt(fromY);
            if (turn === player && terrain[toX][toY] !== 1) {
                socket.emit('move', { fromX: fromXInt, fromY: fromYInt, toX, toY });
            }
        }
    };

    const handleDragOver = (e) => e.preventDefault();

    const handleDragEnter = (e, x, y) => {
        if (phase === 'placement' && isValidPlacement(x, y) && terrain[x][y] !== 1) {
            e.target.classList.add('drop-valid');
        }
    };

    const handleDragLeave = (e) => {
        e.target.classList.remove('drop-valid');
    };

    const isValidPlacement = (x, y) => {
        if (player === 1 && x <= 2 && !board[x][y]) return true;
        if (player === 2 && x >= 4 && !board[x][y]) return true;
        return false;
    };

    const handleReady = () => socket.emit('ready');

    return (
        <div className="game-container">
            <h1>Mini-Stratego - Lobby: {lobbyId}</h1>
            <p>Faction: <strong>{FACTIONS[playerFactionId]?.name || 'Humans'}</strong></p>
            <div className="ability-panel">
                <p><strong>Faction Abilities:</strong> {rulesState.factionAbilities ? 'Enabled' : 'Disabled'}</p>
                {rulesState.factionAbilities && playerFactionId === 'humans' && (
                    <p>Commander Swap: {abilityUsed.marshalSwap ? 'Used' : 'Ready'}</p>
                )}
                {rulesState.factionAbilities && playerFactionId === 'orcs' && (
                    <p>Warlord Roar: {abilityUsed.warlordRoar ? 'Used' : 'Ready'}</p>
                )}
            </div>
            {phase === 'placement' && (
                <div>
                    <p>Placement Phase: Drag a piece to the board</p>
                    <div className="reserve">
                        {factionUnits.map((unit) => {
                            const count = piecesLeft[unit.type] || 0;
                            if (count <= 0) return null;
                            return (
                                <div
                                    key={unit.type}
                                    draggable
                                    onDragStart={(e) => handleDragStartPiece(e, unit.type)}
                                    className="piece-draggable"
                                >
                                    {pieceIcons[unit.type]} {unit.name} x{count}
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={handleReady}>Ready</button>
                    <p>Ready Players: {readyPlayers.join(', ')}</p>
                </div>
            )}
            {phase === 'playing' && (
                <>
                    <div className={`turn-indicator player-${turn}`}>
                        <p>Player {turn}'s Turn</p>
                    </div>
                    <div className="captured-pieces">
                        <h3>Captured Pieces</h3>
                        <div>
                            <strong>Player 1 (Red) Captured:</strong>{' '}
                            {capturedPieces[1].map((type, index) => (
                                <span key={index}>{pieceIcons[type]}</span>
                            ))}
                        </div>
                        <div>
                            <strong>Player 2 (Blue) Captured:</strong>{' '}
                            {capturedPieces[2].map((type, index) => (
                                <span key={index}>{pieceIcons[type]}</span>
                            ))}
                        </div>
                    </div>
                </>
            )}
            <div className="board">
                {terrain.map((row, x) =>
                    row.map((terrainType, y) => (
                        <div
                            key={`${x}-${y}`}
                            className={`cell terrain-${terrainType} ${board[x][y] ? `player-${board[x][y].player}` : ''
                                }`}
                            draggable={phase === 'playing' && board[x][y]?.player === player && turn === player && terrainType !== 1}
                            onDragStart={(e) => handleDragStart(e, x, y)}
                            onDrop={(e) => handleDrop(e, x, y)}
                            onDragOver={handleDragOver}
                            onDragEnter={(e) => handleDragEnter(e, x, y)}
                            onDragLeave={handleDragLeave}
                        >
                            {board[x][y] ? pieceIcons[board[x][y].type] : ''}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Game;