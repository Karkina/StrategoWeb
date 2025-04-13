// src/constants.js

// Visual representation of pieces
export const pieceIcons = {
  queen: '👑',
  guard: '🛡️',
  cavalry: '🐎',
  scout: '🏃',
  disruptor: '🔧',
  spy: '🕵️',
  tactician: '🧠',
  unknown: '❓'
};

// Initial piece counts for each player
export const initialPieces = {
  queen: 1,
  guard: 3,
  cavalry: 2,
  scout: 2,
  disruptor: 1,
  spy: 1,
  tactician: 1
};

// Detailed information about each piece type
export const pieceInfo = {
  queen: { 
    name: "Reine", 
    description: "Bouge tous les 2 tours, jusqu'à 3 cases. Booste les alliés proches.", 
    moves: "Jusqu'à 3 cases orthogonalement, tours impairs", 
    type: "queen" 
  },
  guard: { 
    name: "Garde", 
    description: "Gagne +2 en défense près de la reine. Peut intercepter les attaques.", 
    moves: "Une case", 
    type: "guard" 
  },
  cavalry: { 
    name: "Cavalerie", 
    description: "Bouge en L, saute par-dessus les pièces.", 
    moves: "L (2 puis 1 ou 1 puis 2)", 
    type: "cavalry" 
  },
  scout: { 
    name: "Éclaireur", 
    description: "Bouge rapidement sur 2 cases.", 
    moves: "Deux cases orthogonalement", 
    type: "scout" 
  },
  disruptor: { 
    name: "Perturbateur", 
    description: "Annule le bonus de la reine pour un tour dans un rayon de 3 cases.", 
    moves: "Une case", 
    type: "disruptor" 
  },
  spy: { 
    name: "Espion", 
    description: "Révèle le type des pièces ennemies adjacentes.", 
    moves: "Une case", 
    type: "spy" 
  },
  tactician: { 
    name: "Tacticien", 
    description: "Augmente la force des unités alliées adjacentes de +1 en combat.", 
    moves: "Une case orthogonalement", 
    type: "tactician" 
  }
};

// Definition of terrain types
export const terrainTypes = {
  0: { name: 'Plains', cssClass: 'terrain-plains', impassable: false, description: 'Standard open ground.' },
  1: { name: 'Lake', cssClass: 'terrain-lake', impassable: true, description: 'Impassable terrain.' },
  2: { name: 'Throne', cssClass: 'terrain-throne', impassable: false, description: 'Special objective zone.' }, // Renamed Special Corners
  3: { name: 'Forest', cssClass: 'terrain-forest', impassable: false, description: 'May affect visibility or movement (requires server logic).' },
  4: { name: 'Hills', cssClass: 'terrain-hills', impassable: false, description: 'May offer combat advantages (requires server logic).' }
};

// Initial terrain setup function (can be customized further)
export const generateInitialTerrain = () => {
  const grid = Array(7).fill(null).map(() => Array(7).fill(0)); // Default to Plains (0)
  // Lakes (1)
  grid[3][0] = 1; grid[3][2] = 1; grid[3][4] = 1; grid[3][6] = 1;
  grid[2][2] = 1; grid[2][4] = 1; grid[4][2] = 1; grid[4][4] = 1;
  // Throne zones (2) - Adjusted placement
  grid[0][3] = 2; grid[6][3] = 2;
  // Forests (3)
  grid[1][1] = 3; grid[1][5] = 3; grid[5][1] = 3; grid[5][5] = 3;
  // Hills (4)
  grid[2][3] = 4; grid[4][3] = 4;
  return grid;
};

export const TURN_DURATION = 30; // seconds

// Suggested initial piece placements for each player
export const suggestedPlacements = {
  // Player 1 (bottom player) - pieces are placed at the bottom of the board
  1: [
    { type: "queen", x: 6, y: 3 },     // Queen in the middle back row
    { type: "guard", x: 6, y: 2 },     // Guards around the Queen
    { type: "guard", x: 6, y: 4 },
    { type: "guard", x: 5, y: 3 },
    { type: "cavalry", x: 5, y: 1 },   // Cavalry on the flanks
    { type: "cavalry", x: 5, y: 5 },
    { type: "scout", x: 5, y: 2 },     // Scouts in the middle
    { type: "scout", x: 5, y: 4 },
    { type: "disruptor", x: 6, y: 1 }, // Disruptor on the side
    { type: "spy", x: 6, y: 5 },       // Spy on the other side
    { type: "tactician", x: 6, y: 0 }  // Tactician in the corner
  ],
  
  // Player 2 (top player) - pieces are placed at the top of the board
  2: [
    { type: "queen", x: 0, y: 3 },     // Queen in the middle front row
    { type: "guard", x: 0, y: 2 },     // Guards around the Queen
    { type: "guard", x: 0, y: 4 },
    { type: "guard", x: 1, y: 3 },
    { type: "cavalry", x: 1, y: 1 },   // Cavalry on the flanks
    { type: "cavalry", x: 1, y: 5 },
    { type: "scout", x: 1, y: 2 },     // Scouts in the middle
    { type: "scout", x: 1, y: 4 },
    { type: "disruptor", x: 0, y: 5 }, // Disruptor on the side
    { type: "spy", x: 0, y: 1 },       // Spy on the other side
    { type: "tactician", x: 0, y: 6 }  // Tactician in the corner
  ]
};