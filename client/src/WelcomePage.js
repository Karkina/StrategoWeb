import React, { useState } from 'react';

// Simple component for the initial screen
function WelcomePage({ createLobby, joinLobby, isLoading }) { // Added isLoading prop
  const [lobbyIdInput, setLobbyIdInput] = useState('');

  const handleJoin = () => {
    // Basic validation
    if (lobbyIdInput.trim()) {
      joinLobby(lobbyIdInput.trim());
    } else {
      alert('Please enter a lobby ID.');
    }
  };

  // Handle joining when Enter key is pressed in the input field
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="welcome-page"> {/* Use CSS class for styling */}
      <h1>Welcome to Mini-Stratego</h1>
      <p>Create a new game lobby or enter the ID of a lobby to join.</p>

      {isLoading && <p className="loading-indicator">Connecting...</p>} {/* Show loading indicator */}

      <div className="lobby-actions">
        <button onClick={createLobby} disabled={isLoading} className="button create-button">
          Create Lobby
        </button>
      </div>

      <div className="lobby-actions">
        <input
          type="text"
          value={lobbyIdInput}
          onChange={(e) => setLobbyIdInput(e.target.value)}
          onKeyPress={handleKeyPress} // Add keypress listener
          placeholder="Enter Lobby ID"
          disabled={isLoading}
          className="input lobby-input"
        />
        <button onClick={handleJoin} disabled={isLoading} className="button join-button">
          Join Lobby
        </button>
      </div>
    </div>
  );
}

export default WelcomePage;