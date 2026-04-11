import { useState, useMemo, useRef, useEffect } from 'react';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

const POS_COLORS = {
  QB: '#f59e0b', RB: '#22c55e', WR: '#3b82f6', TE: '#a855f7', K: '#6b7280', DEF: '#ef4444',
};

const INJURY_LABELS = {
  Questionable: { label: 'Q', color: '#f59e0b' },
  Doubtful: { label: 'D', color: '#f97316' },
  Out: { label: 'OUT', color: '#ef4444' },
  IR: { label: 'IR', color: '#ef4444' },
  PUP: { label: 'PUP', color: '#ef4444' },
};

export function PlayerBadge({ player, onRemove }) {
  const inj = INJURY_LABELS[player.injury_status];
  return (
    <div className="player-badge">
      <span className="pos-dot" style={{ background: POS_COLORS[player.position] || '#6b7280' }}>
        {player.position}
      </span>
      <span className="player-badge-name">{player.full_name || player.name}</span>
      {player.team && <span className="player-badge-team">{player.team}</span>}
      {inj && <span className="inj-badge" style={{ color: inj.color }}>{inj.label}</span>}
      {onRemove && (
        <button className="badge-remove" onClick={() => onRemove(player)} type="button">×</button>
      )}
    </div>
  );
}

export default function PlayerSearch({ players, onSelect, exclude = [], label = 'Add player', maxResults = 30 }) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const excludeIds = useMemo(() => new Set(exclude.map(p => p.sleeper_id || p.id)), [exclude]);

  const results = useMemo(() => {
    if (!query && posFilter === 'ALL') return [];
    const q = query.toLowerCase();
    return Object.values(players)
      .filter(p => {
        if (!p.active || !p.position) return false;
        if (!POSITIONS.includes(p.position)) return false;
        if (posFilter !== 'ALL' && p.position !== posFilter) return false;
        if (excludeIds.has(p.player_id)) return false;
        if (q && !p.search_full_name?.includes(q) && !p.full_name?.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.search_rank || 9999) - (b.search_rank || 9999))
      .slice(0, maxResults)
      .map(p => ({
        sleeper_id: p.player_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        injury_status: p.injury_status,
        age: p.age,
        years_exp: p.years_exp,
        search_rank: p.search_rank,
      }));
  }, [query, posFilter, players, excludeIds, maxResults]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function pick(p) {
    onSelect(p);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="player-search" ref={wrapRef}>
      <div className="search-row">
        <div className="pos-filters">
          {['ALL', ...POSITIONS].map(pos => (
            <button
              key={pos}
              type="button"
              className={`pos-filter-btn ${posFilter === pos ? 'active' : ''}`}
              style={pos !== 'ALL' && posFilter === pos ? { background: POS_COLORS[pos] } : {}}
              onClick={() => { setPosFilter(pos); setOpen(true); }}
            >
              {pos}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          placeholder={label}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map(p => {
            const inj = INJURY_LABELS[p.injury_status];
            return (
              <div key={p.sleeper_id} className="search-result" onClick={() => pick(p)}>
                <span className="pos-dot" style={{ background: POS_COLORS[p.position] || '#6b7280' }}>
                  {p.position}
                </span>
                <span className="result-name">{p.full_name}</span>
                {p.team && <span className="result-team">{p.team}</span>}
                {inj && <span className="inj-badge" style={{ color: inj.color }}>{inj.label}</span>}
                {p.age && <span className="result-meta">Age {p.age}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
