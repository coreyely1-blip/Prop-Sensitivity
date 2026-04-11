import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import LeaguesView from './views/LeaguesView';
import RostersView from './views/RostersView';
import TradeView from './views/TradeView';
import { fetchPlayers, clearSleeperCache } from './services/sleeperApi';

function AppContent() {
  const [tab, setTab] = useState('leagues');
  const [players, setPlayers] = useState({});
  const [playersState, setPlayersState] = useState('idle'); // idle | loading | ready | error
  const [playersError, setPlayersError] = useState(null);
  const { selectedLeague } = useApp();

  useEffect(() => {
    setPlayersState('loading');
    fetchPlayers()
      .then(data => { setPlayers(data); setPlayersState('ready'); })
      .catch(e => { setPlayersError(e.message); setPlayersState('error'); });
  }, []);

  const playerCount = Object.keys(players).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <div className="header-brand">
            <span className="brand-icon">🏈</span>
            <div>
              <h1 className="brand-title">Fantasy Trade Analyzer</h1>
              {playersState === 'loading' && (
                <div className="players-loading">Loading Sleeper player database…</div>
              )}
              {playersState === 'ready' && (
                <div className="players-ready">{playerCount.toLocaleString()} NFL players loaded</div>
              )}
              {playersState === 'error' && (
                <div className="players-error">
                  Player data unavailable — {playersError}
                  <button className="btn btn-xs btn-ghost" onClick={() => {
                    clearSleeperCache();
                    window.location.reload();
                  }}>Retry</button>
                </div>
              )}
            </div>
          </div>

          {selectedLeague && (
            <div className="active-league-badge">
              <span className="active-league-label">Active League</span>
              <span className="active-league-name">{selectedLeague.name}</span>
            </div>
          )}
        </div>

        <nav className="tab-nav">
          <button
            className={`tab-btn ${tab === 'leagues' ? 'active' : ''}`}
            onClick={() => setTab('leagues')}
          >
            <span className="tab-icon">🏆</span>
            Leagues
          </button>
          <button
            className={`tab-btn ${tab === 'rosters' ? 'active' : ''}`}
            onClick={() => setTab('rosters')}
            disabled={!selectedLeague}
            title={!selectedLeague ? 'Select a league first' : ''}
          >
            <span className="tab-icon">📋</span>
            Rosters
          </button>
          <button
            className={`tab-btn ${tab === 'trade' ? 'active' : ''}`}
            onClick={() => setTab('trade')}
            disabled={!selectedLeague}
            title={!selectedLeague ? 'Select a league first' : ''}
          >
            <span className="tab-icon">⚖️</span>
            Trade Analyzer
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === 'leagues' && <LeaguesView />}
        {tab === 'rosters' && <RostersView players={players} />}
        {tab === 'trade' && <TradeView players={players} />}
      </main>

      <footer className="app-footer">
        Player data &amp; stats powered by{' '}
        <span className="footer-link">Sleeper API</span>
        {' · '}
        <button className="btn-link" onClick={() => { clearSleeperCache(); window.location.reload(); }}>
          Refresh player data
        </button>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
