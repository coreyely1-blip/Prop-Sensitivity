import { createContext, useContext, useReducer, useEffect } from 'react';
import { loadData, saveData, uid } from '../services/storage';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_ROSTER_SETTINGS } from '../services/tradeAnalysis';

const Ctx = createContext(null);

function reducer(state, action) {
  switch (action.type) {

    case 'CREATE_LEAGUE': {
      const league = {
        id: uid(),
        name: action.name,
        format: action.format || 'ppr',
        teamCount: action.teamCount || 12,
        scoringSettings: { ...DEFAULT_SCORING_SETTINGS, ...(action.scoringOverrides || {}) },
        rosterSettings: { ...DEFAULT_ROSTER_SETTINGS, ...(action.rosterOverrides || {}) },
        teams: [],
        createdAt: Date.now(),
      };
      return { ...state, leagues: [...state.leagues, league], selectedLeagueId: league.id };
    }

    case 'UPDATE_LEAGUE':
      return {
        ...state,
        leagues: state.leagues.map(l => l.id === action.id ? { ...l, ...action.updates } : l),
      };

    case 'DELETE_LEAGUE': {
      const leagues = state.leagues.filter(l => l.id !== action.id);
      return {
        ...state,
        leagues,
        selectedLeagueId: leagues.length ? leagues[0].id : null,
      };
    }

    case 'SELECT_LEAGUE':
      return { ...state, selectedLeagueId: action.id };

    case 'ADD_TEAM': {
      const team = { id: uid(), name: action.name, ownerName: action.ownerName || '', roster: [] };
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId ? { ...l, teams: [...l.teams, team] } : l
        ),
      };
    }

    case 'UPDATE_TEAM':
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId
            ? { ...l, teams: l.teams.map(t => t.id === action.teamId ? { ...t, ...action.updates } : t) }
            : l
        ),
      };

    case 'DELETE_TEAM':
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId
            ? { ...l, teams: l.teams.filter(t => t.id !== action.teamId) }
            : l
        ),
      };

    case 'ADD_PLAYER': {
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId
            ? {
                ...l,
                teams: l.teams.map(t =>
                  t.id === action.teamId
                    ? { ...t, roster: [...t.roster.filter(p => p.sleeper_id !== action.player.sleeper_id), action.player] }
                    : t
                ),
              }
            : l
        ),
      };
    }

    case 'REMOVE_PLAYER':
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId
            ? {
                ...l,
                teams: l.teams.map(t =>
                  t.id === action.teamId
                    ? { ...t, roster: t.roster.filter(p => p.sleeper_id !== action.sleeperId) }
                    : t
                ),
              }
            : l
        ),
      };

    case 'CLEAR_ROSTER':
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.leagueId
            ? { ...l, teams: l.teams.map(t => t.id === action.teamId ? { ...t, roster: [] } : t) }
            : l
        ),
      };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadData);

  useEffect(() => { saveData(state); }, [state]);

  const selectedLeague = state.leagues.find(l => l.id === state.selectedLeagueId) || null;

  return (
    <Ctx.Provider value={{ state, dispatch, selectedLeague }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
