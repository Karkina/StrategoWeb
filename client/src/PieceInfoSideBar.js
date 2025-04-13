import React from 'react';
import './PieceInfoSidebar.css'; // Ensure CSS is imported
// Removed duplicate import of constants if already imported in Game.js
// Assuming pieceInfo and pieceIcons are passed as props

const PieceInfoSideBar = ({
    player,
    turn,
    turnTimeLeft,
    capturedPieces,
    pieceInfo, // Expecting the full piece info object map
    pieceIcons, // Expecting the piece icon map
    hoveredPiece, // Expecting the info object { name, description, moves, type } or null
    isGameOver,
    winner
}) => {

    const opponent = player === 1 ? 2 : 1;

    // Helper to render captured pieces list
    const renderCapturedList = (playerNumber) => {
        const pieces = capturedPieces[playerNumber] || [];
        if (pieces.length === 0) {
            return <span className="no-captures">None</span>;
        }
        // Group captured pieces by type for cleaner display
        const groupedPieces = pieces.reduce((acc, type) => {
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        return Object.entries(groupedPieces).map(([type, count]) => (
            <span key={type} className="captured-piece" title={pieceInfo[type]?.name || type}>
                 {pieceIcons[type] || '?'}
                 {count > 1 && <span className="captured-count">x{count}</span>}
            </span>
        ));
    };

    return (
        <div className="piece-info-sidebar">

            {/* Turn Indicator & Timer */}
            {!isGameOver && (
                <div className={`turn-indicator player-${turn}`}>
                    <h3>Player {turn}'s Turn</h3>
                    {/* Only show timer if it's the current player viewing their own turn */}
                    {turn === player && (
                        <p className={`timer ${turnTimeLeft <= 10 ? 'time-low' : ''}`}>
                            Time left: <span className="time-value">{turnTimeLeft}s</span>
                        </p>
                    )}
                     {turn !== player && (
                        <p className="timer">Opponent's Turn</p>
                     )}
                </div>
            )}

             {/* Game Over Indicator */}
            {isGameOver && (
                <div className={`turn-indicator game-over ${winner === player ? 'winner' : 'loser'}`}>
                    <h3>Game Over</h3>
                    <p>Player {winner} Wins!</p>
                </div>
            )}

            {/* Captured Pieces Section */}
            <div className="captured-section">
                <h4>Captured Pieces</h4>
                <div className="captured-list">
                    <p><strong>Captured by You (Player {player}):</strong></p>
                    <div className="captured-items">{renderCapturedList(opponent)}</div>
                </div>
                <div className="captured-list">
                     <p><strong>Lost by You (Player {player}):</strong></p>
                    <div className="captured-items">{renderCapturedList(player)}</div>
                </div>
            </div>

            {/* Piece Information Section (Details on Hover) */}
            <div className="piece-info-section">
                <h4>Piece Details</h4>
                {hoveredPiece ? (
                    <div className="piece-details">
                        <h5>{hoveredPiece.name} {hoveredPiece.type !== 'unknown' ? `(${pieceIcons[hoveredPiece.type] || '?'})` : ''}</h5>
                        <p className="description">{hoveredPiece.description}</p>
                        <p><strong>Moves:</strong> {hoveredPiece.moves}</p>
                    </div>
                ) : (
                    <p className="placeholder-text">Hover over a piece on the board to see its details.</p>
                )}
            </div>
        </div>
    );
};

export default PieceInfoSideBar;