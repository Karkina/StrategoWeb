import React, { useState } from 'react';

function WelcomePage({ createLobby, joinLobby, factionId, setFactionId, rules, setRules }) {
  const [lobbyIdInput, setLobbyIdInput] = useState('');

  const handleJoin = () => {
    if (lobbyIdInput.trim()) {
      joinLobby(lobbyIdInput.trim());
    } else {
      alert('Please enter a lobby ID.');
    }
  };

  return (
    <div className="welcome-page">
      <h1>Welcome to Mini-Stratego</h1>
      <div className="faction-choice">
        <h3>Choose Your Faction</h3>
        <label className="faction-option">
          <input
            type="radio"
            name="faction"
            value="humans"
            checked={factionId === 'humans'}
            onChange={() => setFactionId('humans')}
          />
          Humans
        </label>
        <label className="faction-option">
          <input
            type="radio"
            name="faction"
            value="orcs"
            checked={factionId === 'orcs'}
            onChange={() => setFactionId('orcs')}
          />
          Orcs
        </label>
      </div>
      <div className="rules-choice">
        <label className="rules-option">
          <input
            type="checkbox"
            checked={Boolean(rules && rules.factionAbilities)}
            onChange={(e) => setRules({ ...rules, factionAbilities: e.target.checked })}
          />
          Enable faction abilities (optional rules)
        </label>
      </div>
      <div className="welcome-actions">
        <button onClick={createLobby}>
          Create Lobby
        </button>
      </div>
      <div>
        <input
          type="text"
          value={lobbyIdInput}
          onChange={(e) => setLobbyIdInput(e.target.value)}
          placeholder="Enter Lobby ID"
          className="lobby-input"
        />
        <button onClick={handleJoin}>
          Join Lobby
        </button>
      </div>
      <p className="rules-note">When joining, the lobby's rules apply.</p>
    </div>
  );
}

export default WelcomePage;