import React from 'react';
import './PieceInfoSidebar.css';

const PieceInfoSideBar = ({ player, capturedPieces, pieceInfo, pieceIcons, turn, hoveredPiece }) => {
    return (
        <div className="piece-info-sidebar">
            {/* Captured Pieces Section */}
            <div className="captured-section">
                <h3>Captured Pieces</h3>
                <div className="captured-list">
                    <div>
                        <strong>Opponent (Player {player === 1 ? 2 : 1}):</strong>
                        {capturedPieces[player === 1 ? 2 : 1].map((type, index) => (
                            <span key={index} className="captured-piece">
                                {pieceIcons[type]}
                            </span>
                        ))}
                    </div>
                    <div>
                        <strong>You (Player {player}):</strong>
                        {capturedPieces[player].map((type, index) => (
                            <span key={index} className="captured-piece">
                                {pieceIcons[type]}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Piece Information Section */}
            <div className="piece-info-section">
                <h3>Piece Details</h3>
                <p>Hover over a piece to see details.</p>
                {hoveredPiece && (
                    <div className="piece-details">
                        <h4>{pieceInfo[hoveredPiece.type].name}</h4>
                        <p>{pieceInfo[hoveredPiece.type].description}</p>
                        <p><strong>Moves:</strong> {pieceInfo[hoveredPiece.type].moves}</p>
                    </div>
                )}
            </div>

            {/* Turn Indicator */}
            <div className={`turn-indicator player-${turn}`}>
                <p>Current Turn: Player {turn}</p>
            </div>
        </div>
    );
};

export default PieceInfoSideBar;