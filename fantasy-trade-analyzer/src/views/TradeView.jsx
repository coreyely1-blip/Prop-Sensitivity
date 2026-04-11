import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import PlayerSearch, { PlayerBadge } from '../components/PlayerSearch';
import { analyzeTrade, generateVerdict, DRAFT_PICK_VALUES, calcPlayerPoints } from '../services/tradeAnalysis';
import { fetchSeasonTotals, fetchRemainingProjections } from '../services/sleeperApi';

const CURRENT_SEASON = 2025;

// Draft pick options
const PICK_OPTIONS = [
  { id: 'early_1st', label: 'Early 1st Rd', round: 1 },
  { id: 'mid_1st',   label: 'Mid 1st Rd',   round: 1 },
  { id: 'late_1st',  label: 'Late 1st Rd',  round: 1 },
  { id: 'early_2nd', label: 'Early 2nd Rd', round: 2 },
  { id: 'mid_2nd',   label: 'Mid 2nd Rd',   round: 2 },
  { id: 'late_2nd',  label: 'Late 2nd Rd',  round: 2 },
  { id: 'early_3rd', label: 'Early 3rd Rd', round: 3 },
  { id: 'mid_3rd',   label: 'Mid 3rd Rd',   round: 3 },
  { id: 'late_3rd',  label: 'Late 3rd Rd',  round: 3 },
  ...Array.from({length: 12}, (_, i) => ({ id: `1.0${i+1 < 10 ? '0'+(i+1) : i+1}`, label: `1.${String(i+1).padStart(2,'0')}`, round: 1 })),
  ...Array.from({length: 12}, (_, i) => ({ id: `2.0${i+1 < 10 ? '0'+(i+1) : i+1}`, label: `2.${String(i+1).padStart(2,'0')}`, round: 2 })),
];

function DraftPickSelector({ onAdd }) {
  const [year, setYear] = useState(2026);
  const [pick, setPick] = useState('early_1st');

  function add() {
    const opt = PICK_OPTIONS.find(o => o.id === pick) || PICK_OPTIONS[0];
    onAdd({
      isDraftPick: true,
      sleeper_id: `pick_${year}_${pick}`,
      pick_id: pick,
      full_name: `${year} ${opt.label}`,
      position: 'PICK',
      team: '',
      injury_status: null,
      year,
    });
  }

  return (
    <div className="pick-selector">
      <select className="form-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
        {[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className="form-select" value={pick} onChange={e => setPick(e.target.value)}>
        {PICK_OPTIONS.slice(0,9).map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
        <optgroup label="Specific Picks">
          {PICK_OPTIONS.slice(9).map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </optgroup>
      </select>
      <button type="button" className="btn btn-sm btn-secondary" onClick={add}>+ Add Pick</button>
    </div>
  );
}

function TradeAsset({ asset, onRemove }) {
  if (asset.isDraftPick) {
    return (
      <div className="player-badge">
        <span className="pos-dot" style={{ background: '#6366f1' }}>PICK</span>
        <span className="player-badge-name">{asset.full_name}</span>
        <span className="player-badge-team">{DRAFT_PICK_VALUES[asset.pick_id] ?? '?'} pts</span>
        {onRemove && <button className="badge-remove" onClick={() => onRemove(asset)} type="button">×</button>}
      </div>
    );
  }
  return <PlayerBadge player={asset} onRemove={onRemove} />;
}

function TradeColumn({ title, team, players, side, gives, gets, onAddPlayer, onRemoveGives, onRemoveGets, onAddPick, allPlayers }) {
  if (!team) return (
    <div className="trade-col">
      <div className="trade-col-header">{title}</div>
      <div className="empty-state"><p>No team selected</p></div>
    </div>
  );

  const excludeFromSearch = [...(team?.roster || []), ...gives, ...gets];

  return (
    <div className="trade-col">
      <div className="trade-col-header">
        <strong>{team.name}</strong>
        {team.ownerName && <span className="team-owner-label">{team.ownerName}</span>}
      </div>

      <div className="trade-section">
        <div className="trade-section-label">Gives Away</div>
        <PlayerSearch
          players={allPlayers}
          onSelect={onAddPlayer}
          exclude={excludeFromSearch}
          label="Add player..."
          maxResults={20}
        />
        <DraftPickSelector onAdd={onAddPick} />
        <div className="trade-assets">
          {gives.length === 0 && <div className="trade-placeholder">No players selected</div>}
          {gives.map(a => (
            <TradeAsset key={a.sleeper_id} asset={a} onRemove={onRemoveGives} />
          ))}
        </div>
      </div>

      <div className="trade-section">
        <div className="trade-section-label receives-label">Receives</div>
        <div className="trade-assets">
          {gets.length === 0 && <div className="trade-placeholder">Players from the other side</div>}
          {gets.map(a => (
            <TradeAsset key={a.sleeper_id} asset={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreStat({ label, value, delta }) {
  const sign = delta >= 0 ? '+' : '';
  const cls = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-zero';
  return (
    <div className="score-stat">
      <span className="score-stat-label">{label}</span>
      <span className="score-stat-value">{value.toFixed(1)}</span>
      <span className={`score-stat-delta ${cls}`}>{sign}{delta.toFixed(1)}</span>
    </div>
  );
}

function NeedsBar({ needs }) {
  const colors = { critical: '#ef4444', thin: '#f59e0b', deep: '#22c55e' };
  return (
    <div className="needs-bar">
      {Object.entries(needs).map(([pos, level]) => (
        <span key={pos} className="need-chip" style={{ borderColor: colors[level], color: colors[level] }}>
          {pos}: {level}
        </span>
      ))}
    </div>
  );
}

export default function TradeView({ players }) {
  const { selectedLeague } = useApp();
  const [team1Id, setTeam1Id] = useState('');
  const [team2Id, setTeam2Id] = useState('');
  const [team1Gives, setTeam1Gives] = useState([]);
  const [team2Gives, setTeam2Gives] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 18 });
  const [error, setError] = useState(null);
  const [statsMode, setStatsMode] = useState('season'); // 'season' | 'remaining'
  const [currentWeek, setCurrentWeek] = useState(10);

  if (!selectedLeague) {
    return (
      <div className="view">
        <div className="empty-state">
          <div className="empty-icon">⚖️</div>
          <p>Select or create a league first.</p>
        </div>
      </div>
    );
  }

  const teams = selectedLeague.teams;
  const team1 = teams.find(t => t.id === team1Id);
  const team2 = teams.find(t => t.id === team2Id);

  const canAnalyze = team1 && team2 && team1Id !== team2Id &&
    (team1Gives.length > 0 || team2Gives.length > 0);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    setLoadProgress({ loaded: 0, total: 18 });

    try {
      let stats;
      const onProg = (loaded, total) => setLoadProgress({ loaded, total });

      if (statsMode === 'remaining') {
        stats = await fetchRemainingProjections(CURRENT_SEASON, currentWeek, onProg);
      } else {
        stats = await fetchSeasonTotals(CURRENT_SEASON, onProg);
      }

      const analysis = analyzeTrade({
        team1: {
          roster: team1.roster,
          gives: team1Gives,
          gets: team2Gives,
        },
        team2: {
          roster: team2.roster,
          gives: team2Gives,
          gets: team1Gives,
        },
        stats,
        scoring: selectedLeague.scoringSettings,
        roster: selectedLeague.rosterSettings,
      });

      const givesNames = team1Gives.map(p => p.full_name || p.name).join(', ') || 'nothing';
      const getsNames = team2Gives.map(p => p.full_name || p.name).join(', ') || 'nothing';
      const funnyMsg = generateVerdict(analysis.verdict, team1.name, team2.name, givesNames, getsNames);

      setResult({ ...analysis, funnyMsg, team1Name: team1.name, team2Name: team2.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setTeam1Gives([]);
    setTeam2Gives([]);
    setResult(null);
    setError(null);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Trade Analyzer — {selectedLeague.name}</h2>
      </div>

      {/* Stats mode selector */}
      <div className="stats-mode-bar">
        <span className="mode-label">Valuation basis:</span>
        <button
          className={`mode-btn ${statsMode === 'season' ? 'active' : ''}`}
          onClick={() => setStatsMode('season')}
        >
          2025 Season Stats
        </button>
        <button
          className={`mode-btn ${statsMode === 'remaining' ? 'active' : ''}`}
          onClick={() => setStatsMode('remaining')}
        >
          Remaining Projections
        </button>
        {statsMode === 'remaining' && (
          <label className="week-selector">
            From week:
            <input
              type="number" min={1} max={18} value={currentWeek}
              onChange={e => setCurrentWeek(parseInt(e.target.value) || 1)}
              className="week-input"
            />
          </label>
        )}
      </div>

      {/* Team selectors */}
      <div className="team-selectors">
        <div className="team-selector-group">
          <label className="form-label">Team 1</label>
          <select className="form-select" value={team1Id} onChange={e => { setTeam1Id(e.target.value); setTeam1Gives([]); setResult(null); }}>
            <option value="">— select team —</option>
            {teams.map(t => <option key={t.id} value={t.id} disabled={t.id === team2Id}>{t.name}{t.ownerName ? ` (${t.ownerName})` : ''}</option>)}
          </select>
        </div>
        <div className="vs-divider">vs</div>
        <div className="team-selector-group">
          <label className="form-label">Team 2</label>
          <select className="form-select" value={team2Id} onChange={e => { setTeam2Id(e.target.value); setTeam2Gives([]); setResult(null); }}>
            <option value="">— select team —</option>
            {teams.map(t => <option key={t.id} value={t.id} disabled={t.id === team1Id}>{t.name}{t.ownerName ? ` (${t.ownerName})` : ''}</option>)}
          </select>
        </div>
      </div>

      {/* Trade columns */}
      <div className="trade-columns">
        <TradeColumn
          title="Team 1"
          team={team1}
          side="team1"
          allPlayers={players}
          gives={team1Gives}
          gets={team2Gives}
          onAddPlayer={p => setTeam1Gives(prev => [...prev.filter(x => x.sleeper_id !== p.sleeper_id), p])}
          onRemoveGives={p => setTeam1Gives(prev => prev.filter(x => x.sleeper_id !== p.sleeper_id))}
          onAddPick={p => setTeam1Gives(prev => [...prev.filter(x => x.sleeper_id !== p.sleeper_id), p])}
        />
        <TradeColumn
          title="Team 2"
          team={team2}
          side="team2"
          allPlayers={players}
          gives={team2Gives}
          gets={team1Gives}
          onAddPlayer={p => setTeam2Gives(prev => [...prev.filter(x => x.sleeper_id !== p.sleeper_id), p])}
          onRemoveGives={p => setTeam2Gives(prev => prev.filter(x => x.sleeper_id !== p.sleeper_id))}
          onAddPick={p => setTeam2Gives(prev => [...prev.filter(x => x.sleeper_id !== p.sleeper_id), p])}
        />
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      <div className="analyze-actions">
        {canAnalyze && !result && (
          <button
            className="btn btn-analyze"
            onClick={analyze}
            disabled={loading}
          >
            {loading
              ? `Loading stats... (${loadProgress.loaded}/${loadProgress.total} weeks)`
              : '⚖️ Analyze Trade'}
          </button>
        )}
        {result && (
          <button className="btn btn-ghost" onClick={reset}>Reset Trade</button>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="trade-result">
          <div className={`verdict-banner verdict-${result.winner}`}>
            <div className="verdict-msg">{result.funnyMsg}</div>
          </div>

          <div className="result-columns">
            {/* Team 1 */}
            <div className={`result-col ${result.winner === 'team1' ? 'winner' : result.winner === 'team2' ? 'loser' : ''}`}>
              <div className="result-col-header">
                {result.winner === 'team1' && <span className="winner-crown">👑</span>}
                <h3>{result.team1Name}</h3>
                {result.winner === 'team1' && <span className="winner-tag">WINS</span>}
                {result.winner === 'team2' && <span className="loser-tag">LOSES</span>}
              </div>
              <ScoreStat label="Proj. Starter Pts" value={result.team1.after.total} delta={result.team1.delta} />
              <div className="value-row">
                <span>Assets received:</span>
                <strong>{result.team1.getsValue.toFixed(1)} pts value</strong>
              </div>
              <div className="value-row">
                <span>Assets given:</span>
                <strong>{result.team1.givesValue.toFixed(1)} pts value</strong>
              </div>
              <div className="value-row">
                <span>Net value:</span>
                <strong className={result.team1.getsValue >= result.team1.givesValue ? 'text-success' : 'text-danger'}>
                  {(result.team1.getsValue - result.team1.givesValue) >= 0 ? '+' : ''}{(result.team1.getsValue - result.team1.givesValue).toFixed(1)}
                </strong>
              </div>
              <div className="needs-section">
                <div className="needs-title">Positional Depth After Trade:</div>
                <NeedsBar needs={result.team1.needs} />
              </div>
            </div>

            {/* Team 2 */}
            <div className={`result-col ${result.winner === 'team2' ? 'winner' : result.winner === 'team1' ? 'loser' : ''}`}>
              <div className="result-col-header">
                {result.winner === 'team2' && <span className="winner-crown">👑</span>}
                <h3>{result.team2Name}</h3>
                {result.winner === 'team2' && <span className="winner-tag">WINS</span>}
                {result.winner === 'team1' && <span className="loser-tag">LOSES</span>}
              </div>
              <ScoreStat label="Proj. Starter Pts" value={result.team2.after.total} delta={result.team2.delta} />
              <div className="value-row">
                <span>Assets received:</span>
                <strong>{result.team2.getsValue.toFixed(1)} pts value</strong>
              </div>
              <div className="value-row">
                <span>Assets given:</span>
                <strong>{result.team2.givesValue.toFixed(1)} pts value</strong>
              </div>
              <div className="value-row">
                <span>Net value:</span>
                <strong className={result.team2.getsValue >= result.team2.givesValue ? 'text-success' : 'text-danger'}>
                  {(result.team2.getsValue - result.team2.givesValue) >= 0 ? '+' : ''}{(result.team2.getsValue - result.team2.givesValue).toFixed(1)}
                </strong>
              </div>
              <div className="needs-section">
                <div className="needs-title">Positional Depth After Trade:</div>
                <NeedsBar needs={result.team2.needs} />
              </div>
            </div>
          </div>

          <div className="impact-summary">
            <div className="impact-stat">
              <span>Impact diff (Team1 − Team2):</span>
              <strong className={result.impactDiff >= 0 ? 'text-success' : 'text-danger'}>
                {result.impactDiff >= 0 ? '+' : ''}{result.impactDiff.toFixed(1)} pts
              </strong>
            </div>
            <div className="impact-stat">
              <span>Value diff (Team1 received − given):</span>
              <strong className={result.valueDiff >= 0 ? 'text-success' : 'text-danger'}>
                {result.valueDiff >= 0 ? '+' : ''}{result.valueDiff.toFixed(1)}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
