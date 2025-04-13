import React from 'react';
import { terrainTypes } from './constants'; // Import terrain definitions

// Represents a single cell on the game board
const Cell = ({
  x,
  y,
  terrainCode,
  piece,
  player, // Current player's perspective
  turn, // Current turn player
  phase, // Game phase ('placement' or 'playing')
  getPieceIcon,
  handleDrop,
  handleDragOver,
  handleDragStart,
  handleDragEnter,
  handleDragLeave,
  handleContextMenu,
  handleMouseEnter,
  handleMouseLeave,
  isPlacementZone, // Is this cell valid for placing pieces?
}) => {

  const terrain = terrainTypes[terrainCode];
  const pieceIcon = getPieceIcon(piece); // Use the passed function to get the icon
  const isOccupied = !!piece;
  const isOwnPiece = piece && piece.player === player;
  const isTurn = turn === player;
  const isDraggable = phase === 'playing' && isOwnPiece && isTurn && !terrain.impassable;

  // Combine CSS classes based on state
  const cellClasses = [
    'cell',
    terrain.cssClass, // Use CSS class from terrain definition
    piece ? `player-${piece.player}` : '',
    isPlacementZone ? 'drop-valid' : '' // Highlight for placement drop
  ].filter(Boolean).join(' '); // Filter out empty strings and join

  return (
    <div
      key={`${x}-${y}`}
      className={cellClasses}
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && handleDragStart(e, x, y, piece)} // Pass piece info
      onDrop={(e) => handleDrop(e, x, y)}
      onDragOver={handleDragOver}
      onDragEnter={(e) => handleDragEnter(e, x, y)}
      onDragLeave={(e) => handleDragLeave(e, x, y)}
      onContextMenu={(e) => handleContextMenu(e, piece, x, y)} // Pass piece for context menu
      onMouseEnter={() => handleMouseEnter(piece)}
      onMouseLeave={handleMouseLeave}
      data-x={x}
      data-y={y}
      title={terrain.description} // Add terrain description on hover
    >
      {/* Display piece icon if present */}
      {pieceIcon}

      {/* Optional: Add indicators for piece status (e.g., boosted, hidden) */}
      {/* {piece?.status === 'boosted' && <div className="status-indicator boosted-indicator"></div>} */}
    </div>
  );
};

export default Cell;