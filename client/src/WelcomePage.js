import React, { useState } from 'react';

function WelcomePage({ createLobby, joinLobby }) {
  const [lobbyIdInput, setLobbyIdInput] = useState('');

  const handleJoin = () => {
    if (lobbyIdInput.trim()) {
      joinLobby(lobbyIdInput.trim());
    } else {
      alert('Please enter a lobby ID.');
    }
  };

  return (
    <div className="welcome-page" style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Welcome to Mini-Stratego</h1>
      <div style={{ margin: '20px' }}>
        <button onClick={createLobby} style={{ padding: '10px 20px', marginRight: '10px' }}>
          Create Lobby
        </button>
      </div>
      <div>
        <input
          type="text"
          value={lobbyIdInput}
          onChange={(e) => setLobbyIdInput(e.target.value)}
          placeholder="Enter Lobby ID"
          style={{ padding: '10px', marginRight: '10px' }}
        />
        <button onClick={handleJoin} style={{ padding: '10px 20px' }}>
          Join Lobby
        </button>
      </div>
    </div>
  );
}

export default WelcomePage;