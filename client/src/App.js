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
  const [factionId, setFactionId] = useState('humans');
  const [rules, setRules] = useState({ factionAbilities: false });

  useEffect(() => {
    socket.on('assignPlayer', ({ lobbyId, playerNumber, factionId }) => {
      setLobbyId(lobbyId);
      setPlayer(playerNumber);
      if (factionId) {
        setFactionId(factionId);
      }
      setPage('game');
    });
    socket.on('rulesInfo', (rulesInfo) => {
      if (rulesInfo) {
        setRules(rulesInfo);
      }
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
      socket.off('rulesInfo');
    };
  }, []);

  const createLobby = () => {
    socket.emit('createLobby', { factionId, rules });
  };

  const joinLobby = (lobbyId) => {
    socket.emit('joinLobby', { lobbyId, factionId });
  };

  return (
    <div className="game-container">
      {page === 'welcome' && (
        <WelcomePage
          createLobby={createLobby}
          joinLobby={joinLobby}
          factionId={factionId}
          setFactionId={setFactionId}
          rules={rules}
          setRules={setRules}
        />
      )}
      {page === 'game' && (
        <Game lobbyId={lobbyId} player={player} socket={socket} factionId={factionId} rules={rules} />
      )}
    </div>
  );
}

export default App;