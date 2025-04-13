import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import WelcomePage from './WelcomePage';
import Game from './Game';
import './App.css'; // Ensure main CSS is imported

// Connect to the Socket.IO server
// Ensure this URL is correct for your server setup
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
const socket = io(SOCKET_URL, {
    reconnectionAttempts: 5, // Try to reconnect a few times
    reconnectionDelay: 1000, // Wait 1 second between attempts
});

function App() {
  const [page, setPage] = useState('welcome'); // 'welcome', 'connecting', 'game', 'error'
  const [lobbyId, setLobbyId] = useState(null);
  const [player, setPlayer] = useState(null); // 1 or 2
  const [errorMsg, setErrorMsg] = useState(''); // For displaying errors

  useEffect(() => {
    // Handle successful connection
    socket.on('connect', () => {
        console.log('Connected to server via Socket.IO');
        setErrorMsg(''); // Clear errors on successful connect/reconnect
        // If user was trying to join a lobby before connection, maybe retry?
    });

    // Handle assignment to a game lobby
    socket.on('assignPlayer', ({ lobbyId: assignedLobbyId, playerNumber }) => {
      console.log(`Assigned to lobby ${assignedLobbyId} as Player ${playerNumber}`);
      setLobbyId(assignedLobbyId);
      setPlayer(playerNumber);
      setPage('game'); // Switch to the game view
      setErrorMsg('');
    });

    // Handle general errors from the server
    socket.on('error', (message) => {
        console.error('Server Error:', message);
        setErrorMsg(message); // Show error to the user
        // Consider navigating back to welcome or showing error on current page
        // setPage('error'); // Or show error on welcome page
    });

     // Handle specific lobby errors
     socket.on('lobbyError', (message) => {
        console.error('Lobby Error:', message);
        setErrorMsg(`Lobby Error: ${message}`);
        setPage('welcome'); // Go back to welcome page on lobby error
     });

    // Handle opponent disconnection
    socket.on('playerDisconnected', () => {
      alert('The other player disconnected. Returning to the main menu.');
      setPage('welcome');
      setLobbyId(null);
      setPlayer(null);
      setErrorMsg('Opponent disconnected.');
    });

     // Handle server disconnection
    socket.on('disconnect', (reason) => {
        console.log(`Disconnected from server: ${reason}`);
        setErrorMsg('Lost connection to the server. Please refresh or try again later.');
        // Don't automatically go to welcome, user might be mid-game and server might come back
        // setPage('error'); // Or a specific 'disconnected' page/state
        // If the disconnection was initiated by the client, reason will be 'io client disconnect'
         if (reason !== 'io client disconnect') {
             // Consider showing a reconnecting indicator
         }
    });

    // Cleanup listeners on component unmount
    return () => {
      socket.off('connect');
      socket.off('assignPlayer');
      socket.off('error');
      socket.off('lobbyError');
      socket.off('playerDisconnected');
      socket.off('disconnect');
      // socket.disconnect(); // Optionally disconnect socket on App unmount
    };
  }, []); // Empty dependency array means this runs once on mount

  // Function to request lobby creation
  const createLobby = () => {
    console.log('Requesting to create lobby...');
    setPage('connecting'); // Show a connecting/waiting state
    setErrorMsg('');
    socket.emit('createLobby');
  };

  // Function to request joining a lobby
  const joinLobby = (lobbyIdToJoin) => {
     if (!lobbyIdToJoin || lobbyIdToJoin.trim() === '') {
        setErrorMsg('Please enter a valid Lobby ID.');
        return;
     }
     console.log(`Requesting to join lobby: ${lobbyIdToJoin}`);
     setPage('connecting'); // Show a connecting/waiting state
     setErrorMsg('');
     socket.emit('joinLobby', lobbyIdToJoin.trim());
  };

  // Render logic based on the current page state
  return (
    <div className="app-container"> {/* Changed class name for clarity */}
        {/* Display Global Errors */}
        {errorMsg && <p className="error-message">{errorMsg}</p>}

        {/* Welcome/Connecting Page */}
        {(page === 'welcome' || page === 'connecting') && (
            <WelcomePage
                createLobby={createLobby}
                joinLobby={joinLobby}
                isLoading={page === 'connecting'} // Pass loading state
            />
        )}

        {/* Game Page */}
        {page === 'game' && lobbyId && player && (
            <Game lobbyId={lobbyId} player={player} socket={socket} />
        )}

        {/* Error Page / Disconnected State (Optional) */}
        {/* {page === 'error' && ( ... display error details ... )} */}
    </div>
  );
}

export default App;