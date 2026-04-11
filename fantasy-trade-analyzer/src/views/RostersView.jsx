import { useState } from 'react';
import { useApp } from '../context/AppContext';
import PlayerSearch, { PlayerBadge } from '../components/PlayerSearch';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function groupByPosition(roster) {
  const groups = {};
  POS_ORDER.forEach(p => { groups[p] = []; });
  roster.forEach(p => {
    if (groups[p.position]) groups[p.position].push(p);
    else groups[p.position] = [p];
  });
  return groups;
}

export default function RostersView({ players }) {
  const { state, dispatch, selectedLeague } = useApp();
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editOwner, setEditOwner] = useState('');

  if (!selectedLeague) {
    return (
      <div className="view">
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>Select or create a league first.</p>
        </div>
      </div>
    );
  }

  const teams = selectedLeague.teams;
  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  function addTeam(e) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    dispatch({ type: 'ADD_TEAM', leagueId: selectedLeague.id, name: newTeamName, ownerName: newOwnerName });
    setNewTeamName('');
    setNewOwnerName('');
    setShowAddTeam(false);
  }

  function saveEdit(e) {
    e.preventDefault();
    dispatch({ type: 'UPDATE_TEAM', leagueId: selectedLeague.id, teamId: editingTeamId,
      updates: { name: editName, ownerName: editOwner } });
    setEditingTeamId(null);
  }

  function addPlayer(player) {
    dispatch({ type: 'ADD_PLAYER', leagueId: selectedLeague.id, teamId: selectedTeamId, player });
  }

  function removePlayer(player) {
    dispatch({ type: 'REMOVE_PLAYER', leagueId: selectedLeague.id, teamId: selectedTeamId, sleeperId: player.sleeper_id });
  }

  // All players already on any roster in this league (for exclusion in search)
  const allRosteredIds = new Set(
    teams.flatMap(t => t.roster.map(p => p.sleeper_id))
  );

  // Currently selected team roster players (exclude them from search too)
  const currentRoster = selectedTeam?.roster || [];

  return (
    <div className="view">
      <div className="view-header">
        <h2>{selectedLeague.name} — Rosters</h2>
        <button className="btn btn-primary" onClick={() => setShowAddTeam(true)}>+ Add Team</button>
      </div>

      {showAddTeam && (
        <form className="inline-form" onSubmit={addTeam}>
          <input
            className="form-input"
            placeholder="Team name (e.g., The Touchdowns)"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            autoFocus
            required
          />
          <input
            className="form-input"
            placeholder="Owner name (optional)"
            value={newOwnerName}
            onChange={e => setNewOwnerName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Add</button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowAddTeam(false)}>Cancel</button>
        </form>
      )}

      <div className="roster-layout">
        {/* Team sidebar */}
        <div className="team-sidebar">
          <h3 className="sidebar-title">Teams ({teams.length})</h3>
          {teams.length === 0 && (
            <p className="sidebar-empty">No teams yet.</p>
          )}
          {teams.map(team => (
            <div key={team.id}>
              {editingTeamId === team.id ? (
                <form className="team-edit-form" onSubmit={saveEdit}>
                  <input className="form-input form-input--sm" value={editName}
                    onChange={e => setEditName(e.target.value)} required />
                  <input className="form-input form-input--sm" value={editOwner}
                    onChange={e => setEditOwner(e.target.value)} placeholder="Owner" />
                  <button type="submit" className="btn btn-sm btn-primary">Save</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingTeamId(null)}>×</button>
                </form>
              ) : (
                <div
                  className={`team-item ${selectedTeamId === team.id ? 'active' : ''}`}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <div className="team-item-body">
                    <div className="team-name">{team.name}</div>
                    {team.ownerName && <div className="team-owner">{team.ownerName}</div>}
                    <div className="team-count">{team.roster.length} players</div>
                  </div>
                  <div className="team-item-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-xs btn-ghost" onClick={() => {
                      setEditingTeamId(team.id); setEditName(team.name); setEditOwner(team.ownerName || '');
                    }}>✎</button>
                    <button className="btn btn-xs btn-danger" onClick={() => {
                      if (confirm(`Delete "${team.name}"?`)) {
                        dispatch({ type: 'DELETE_TEAM', leagueId: selectedLeague.id, teamId: team.id });
                        if (selectedTeamId === team.id) setSelectedTeamId(null);
                      }
                    }}>✕</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Roster panel */}
        <div className="roster-panel">
          {!selectedTeam ? (
            <div className="empty-state">
              <div className="empty-icon">👈</div>
              <p>Select a team to manage their roster.</p>
            </div>
          ) : (
            <>
              <div className="roster-header">
                <h3>{selectedTeam.name}{selectedTeam.ownerName ? ` (${selectedTeam.ownerName})` : ''}</h3>
                {currentRoster.length > 0 && (
                  <button className="btn btn-sm btn-danger" onClick={() => {
                    if (confirm(`Clear all ${currentRoster.length} players from ${selectedTeam.name}?`)) {
                      dispatch({ type: 'CLEAR_ROSTER', leagueId: selectedLeague.id, teamId: selectedTeamId });
                    }
                  }}>Clear Roster</button>
                )}
              </div>

              <PlayerSearch
                players={players}
                onSelect={addPlayer}
                exclude={currentRoster}
                label="Search and add players..."
              />

              {currentRoster.length === 0 ? (
                <div className="empty-roster">
                  <p>No players added yet. Use the search above to add players.</p>
                </div>
              ) : (
                <div className="roster-by-position">
                  {Object.entries(groupByPosition(currentRoster)).map(([pos, posPlayers]) => {
                    if (posPlayers.length === 0) return null;
                    return (
                      <div key={pos} className="pos-group">
                        <div className="pos-group-label">{pos} ({posPlayers.length})</div>
                        <div className="pos-group-players">
                          {posPlayers.map(p => (
                            <PlayerBadge key={p.sleeper_id} player={p} onRemove={removePlayer} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
