import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import WelcomePage from './WelcomePage';
import Game from './Game';
import './App.css';

const socket = io('http://localhost:3000');

function App() {
  const [page, setPage] = useState('welcome');
  const [lobbyId, setLobbyId] = useState(null);
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    socket.on('assignPlayer', ({ lobbyId, playerNumber }) => {
      setLobbyId(lobbyId);
      setPlayer(playerNumber);
      setPage('game');
    });
    socket.on('error', (message) => {
      alert(message);
    });
    socket.on('playerDisconnected', () => {
      alert('The other player disconnected.');
      setPage('welcome');
      setLobbyId(null);
      setPlayer(null);
    });
    return () => {
      socket.off('assignPlayer');
      socket.off('error');
      socket.off('playerDisconnected');
    };
  }, []);

  const createLobby = () => {
    socket.emit('createLobby');
  };

  const joinLobby = (lobbyId) => {
    socket.emit('joinLobby', lobbyId);
  };

  return (
    <div className="game-container">
      {page === 'welcome' && <WelcomePage createLobby={createLobby} joinLobby={joinLobby} />}
      {page === 'game' && <Game lobbyId={lobbyId} player={player} socket={socket} />}
    </div>
  );
}

export default App;