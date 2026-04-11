import { useState } from 'react';
import { SCORING_PRESETS, DEFAULT_SCORING_SETTINGS, DEFAULT_ROSTER_SETTINGS } from '../services/tradeAnalysis';

const SCORING_FIELDS = [
  { section: 'Passing', fields: [
    { key: 'pass_td',  label: 'Points per Pass TD',    step: 1,    min: 0 },
    { key: 'pass_yd',  label: 'Points per Pass Yard',  step: 0.01, min: 0 },
    { key: 'pass_int', label: 'Points per INT',        step: 1,    min: -10, max: 0 },
    { key: 'pass_2pt', label: '2-Point Conversion',    step: 1,    min: 0 },
    { key: 'bonus_pass_yd_300', label: 'Bonus: 300+ Pass Yds', step: 1, min: 0 },
  ]},
  { section: 'Rushing', fields: [
    { key: 'rush_td',  label: 'Points per Rush TD',    step: 1,    min: 0 },
    { key: 'rush_yd',  label: 'Points per Rush Yard',  step: 0.01, min: 0 },
    { key: 'rush_2pt', label: '2-Point Conversion',    step: 1,    min: 0 },
    { key: 'bonus_rush_yd_100', label: 'Bonus: 100+ Rush Yds', step: 1, min: 0 },
  ]},
  { section: 'Receiving', fields: [
    { key: 'rec_td',      label: 'Points per Rec TD',    step: 1,    min: 0 },
    { key: 'rec_yd',      label: 'Points per Rec Yard',  step: 0.01, min: 0 },
    { key: 'rec',         label: 'Points per Reception', step: 0.5,  min: 0 },
    { key: 'te_premium',  label: 'TE Premium (extra/rec)',step: 0.5, min: 0 },
    { key: 'bonus_rec_yd_100', label: 'Bonus: 100+ Rec Yds', step: 1, min: 0 },
  ]},
  { section: 'Misc', fields: [
    { key: 'fum_lost', label: 'Points per Fumble Lost', step: 1, min: -10, max: 0 },
  ]},
];

const ROSTER_FIELDS = [
  { key: 'QB', label: 'QB Starters' },
  { key: 'RB', label: 'RB Starters' },
  { key: 'WR', label: 'WR Starters' },
  { key: 'TE', label: 'TE Starters' },
  { key: 'FLEX', label: 'FLEX (RB/WR/TE)' },
  { key: 'SUPERFLEX', label: 'SuperFLEX (QB/RB/WR/TE)' },
  { key: 'K', label: 'K Starters' },
  { key: 'DEF', label: 'DEF/ST Starters' },
  { key: 'BENCH', label: 'Bench Spots' },
];

export default function ScoringSettings({ scoring, roster, onChange, onRosterChange }) {
  const [activePreset, setActivePreset] = useState(null);

  function applyPreset(key) {
    const preset = SCORING_PRESETS[key];
    if (!preset) return;
    onChange({ ...DEFAULT_SCORING_SETTINGS, ...preset.overrides });
    setActivePreset(key);
  }

  function updateScoring(key, val) {
    onChange({ ...scoring, [key]: parseFloat(val) || 0 });
    setActivePreset(null);
  }

  function updateRoster(key, val) {
    onRosterChange({ ...roster, [key]: parseInt(val, 10) || 0 });
  }

  return (
    <div className="scoring-settings">
      <div className="preset-bar">
        <span className="preset-label">Quick Presets:</span>
        {Object.entries(SCORING_PRESETS).map(([k, v]) => (
          <button
            key={k}
            className={`preset-btn ${activePreset === k ? 'active' : ''}`}
            onClick={() => applyPreset(k)}
            type="button"
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="settings-grid">
        <div className="settings-col">
          <h4 className="settings-col-title">Scoring</h4>
          {SCORING_FIELDS.map(section => (
            <div key={section.section} className="settings-section">
              <h5>{section.section}</h5>
              {section.fields.map(f => (
                <label key={f.key} className="field-row">
                  <span className="field-label">{f.label}</span>
                  <input
                    type="number"
                    className="field-input"
                    value={scoring[f.key] ?? 0}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    onChange={e => updateScoring(f.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="settings-col">
          <h4 className="settings-col-title">Roster Slots</h4>
          <div className="settings-section">
            {ROSTER_FIELDS.map(f => (
              <label key={f.key} className="field-row">
                <span className="field-label">{f.label}</span>
                <input
                  type="number"
                  className="field-input field-input--narrow"
                  value={roster[f.key] ?? 0}
                  step={1}
                  min={0}
                  max={20}
                  onChange={e => updateRoster(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
