import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ScoringSettings from '../components/ScoringSettings';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_ROSTER_SETTINGS, SCORING_PRESETS } from '../services/tradeAnalysis';

const FORMAT_DEFAULTS = {
  ppr:      { label: 'PPR',          overrides: { rec: 1, te_premium: 0 } },
  half_ppr: { label: 'Half-PPR',     overrides: { rec: 0.5, te_premium: 0 } },
  standard: { label: 'Standard',     overrides: { rec: 0, te_premium: 0 } },
  teppr:    { label: 'TE-Premium PPR', overrides: { rec: 1, te_premium: 0.5 } },
};

export default function LeaguesView() {
  const { state, dispatch, selectedLeague } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(null);

  function openCreate() {
    setForm({
      name: '',
      format: 'ppr',
      teamCount: 12,
      scoringSettings: { ...DEFAULT_SCORING_SETTINGS, rec: 1 },
      rosterSettings: { ...DEFAULT_ROSTER_SETTINGS },
    });
    setEditMode(false);
    setShowForm(true);
  }

  function openEdit(league) {
    setForm({
      id: league.id,
      name: league.name,
      format: league.format,
      teamCount: league.teamCount || 12,
      scoringSettings: { ...league.scoringSettings },
      rosterSettings: { ...league.rosterSettings },
    });
    setEditMode(true);
    setShowForm(true);
  }

  function applyFormatPreset(fmt) {
    const preset = FORMAT_DEFAULTS[fmt];
    if (!preset) return;
    setForm(f => ({
      ...f,
      format: fmt,
      scoringSettings: { ...DEFAULT_SCORING_SETTINGS, ...preset.overrides },
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editMode) {
      dispatch({ type: 'UPDATE_LEAGUE', id: form.id, updates: {
        name: form.name,
        format: form.format,
        teamCount: form.teamCount,
        scoringSettings: form.scoringSettings,
        rosterSettings: form.rosterSettings,
      }});
    } else {
      dispatch({ type: 'CREATE_LEAGUE', name: form.name, format: form.format,
        teamCount: form.teamCount,
        scoringOverrides: { ...form.scoringSettings },
        rosterOverrides: { ...form.rosterSettings },
      });
    }
    setShowForm(false);
    setForm(null);
  }

  if (showForm && form) {
    return (
      <div className="view">
        <div className="view-header">
          <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
          <h2>{editMode ? 'Edit League' : 'New League'}</h2>
        </div>

        <form className="league-form" onSubmit={submit}>
          <div className="form-section">
            <label className="form-label">
              League Name
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Fantasy League"
                required
              />
            </label>

            <label className="form-label">
              Number of Teams
              <input
                className="form-input"
                type="number"
                min={4}
                max={32}
                value={form.teamCount}
                onChange={e => setForm(f => ({ ...f, teamCount: parseInt(e.target.value, 10) || 12 }))}
              />
            </label>

            <div className="form-label">
              Scoring Format
              <div className="format-btns">
                {Object.entries(FORMAT_DEFAULTS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className={`format-btn ${form.format === k ? 'active' : ''}`}
                    onClick={() => applyFormatPreset(k)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <details className="collapsible">
            <summary className="collapsible-summary">Custom Scoring & Roster Settings</summary>
            <ScoringSettings
              scoring={form.scoringSettings}
              roster={form.rosterSettings}
              onChange={s => setForm(f => ({ ...f, scoringSettings: s }))}
              onRosterChange={r => setForm(f => ({ ...f, rosterSettings: r }))}
            />
          </details>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Save Changes' : 'Create League'}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>My Leagues</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ New League</button>
      </div>

      {state.leagues.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏈</div>
          <p>No leagues yet. Create one to get started!</p>
          <button className="btn btn-primary" onClick={openCreate}>Create Your First League</button>
        </div>
      ) : (
        <div className="league-list">
          {state.leagues.map(league => (
            <div
              key={league.id}
              className={`league-card ${selectedLeague?.id === league.id ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_LEAGUE', id: league.id })}
            >
              <div className="league-card-body">
                <div className="league-card-title">
                  {league.name}
                  {selectedLeague?.id === league.id && <span className="active-badge">Active</span>}
                </div>
                <div className="league-card-meta">
                  {FORMAT_DEFAULTS[league.format]?.label || league.format} · {league.teamCount || 12} teams · {league.teams?.length || 0} rosters set
                </div>
                <div className="league-card-scoring">
                  Rec: {league.scoringSettings.rec}pts · Pass TD: {league.scoringSettings.pass_td}pts · Rush TD: {league.scoringSettings.rush_td}pts
                  {league.scoringSettings.te_premium > 0 && ` · TE+${league.scoringSettings.te_premium}`}
                </div>
              </div>
              <div className="league-card-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEdit(league)}>Edit</button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (confirm(`Delete "${league.name}"? This cannot be undone.`)) {
                      dispatch({ type: 'DELETE_LEAGUE', id: league.id });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
