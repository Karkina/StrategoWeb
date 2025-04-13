// QueenIcon.js
export const QueenIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M12 2 L2 22 L12 18 L22 22 Z" /> {/* Placeholder: Ant with crown */}
    </svg>
);

// SoldierIcon.js
export const SoldierIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" /> {/* Placeholder: Armored ant */}
    </svg>
);

// SneakIcon.js
export const SneakIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" /> {/* Placeholder: Stealthy ant */}
    </svg>
);

// ForagerIcon.js
export const ForagerIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M2 12 H22 M12 2 V22" /> {/* Placeholder: Ant with food */}
    </svg>
);

// WorkerIcon.js
export const WorkerIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M6 6 L18 18 M18 6 L6 18" /> {/* Placeholder: Ant with tool */}
    </svg>
);

// TrapIcon.js
export const TrapIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <polygon points="12,2 2,22 22,22" /> {/* Placeholder: Web or pit */}
    </svg>
);

// UnknownIcon.js
export const UnknownIcon = () => (
    <svg className="piece-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="20">?</text>
    </svg>
);