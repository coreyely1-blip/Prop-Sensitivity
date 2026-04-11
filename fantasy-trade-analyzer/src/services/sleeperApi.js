const BASE = 'https://api.sleeper.app/v1';

const TTL = {
  PLAYERS: 24 * 60 * 60 * 1000,       // 24h – roster info changes slowly
  STATS: 7 * 24 * 60 * 60 * 1000,     // 7d  – historical stats don't change
  SEASON_TOTALS: 6 * 60 * 60 * 1000,  // 6h  – refresh mid-season
};

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts, ttl } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key, data, ttl) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), ttl }));
  } catch (e) {
    // Quota exceeded – clear old Sleeper caches and retry once
    if (e.name === 'QuotaExceededError') {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sleeper_'))
        .forEach(k => localStorage.removeItem(k));
      try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), ttl })); } catch {}
    }
  }
}

// ── Players ──────────────────────────────────────────────────────────────────

export async function fetchPlayers() {
  const key = 'sleeper_players';
  const hit = cacheGet(key);
  if (hit) return hit;

  const res = await fetch(`${BASE}/players/nfl`);
  if (!res.ok) throw new Error('Failed to load Sleeper player database');
  const data = await res.json();
  cacheSet(key, data, TTL.PLAYERS);
  return data;
}

// ── Stats / Projections ───────────────────────────────────────────────────────

export async function fetchWeekStats(season, week) {
  const key = `sleeper_stats_${season}_${week}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const res = await fetch(`${BASE}/stats/nfl/regular/${season}/${week}`);
  if (!res.ok) throw new Error(`Stats unavailable for ${season} W${week}`);
  const data = await res.json();
  cacheSet(key, data, TTL.STATS);
  return data;
}

export async function fetchWeekProjections(season, week) {
  const key = `sleeper_proj_${season}_${week}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const res = await fetch(`${BASE}/projections/nfl/regular/${season}/${week}`);
  if (!res.ok) throw new Error(`Projections unavailable for ${season} W${week}`);
  const data = await res.json();
  cacheSet(key, data, TTL.SEASON_TOTALS);
  return data;
}

/**
 * Aggregate full-season stats for `season` by summing weeks 1-18.
 * Calls onProgress(loaded, total) after each week.
 * Results are cached for TTL.SEASON_TOTALS.
 */
export async function fetchSeasonTotals(season, onProgress) {
  const key = `sleeper_season_totals_${season}`;
  const hit = cacheGet(key);
  if (hit) { onProgress?.(18, 18); return hit; }

  const totals = {};
  let fetched = 0;

  for (let week = 1; week <= 18; week++) {
    try {
      const wk = await fetchWeekStats(season, week);
      fetched++;
      onProgress?.(fetched, 18);
      for (const [pid, stats] of Object.entries(wk)) {
        if (!totals[pid]) totals[pid] = {};
        for (const [stat, val] of Object.entries(stats)) {
          if (typeof val === 'number') {
            totals[pid][stat] = (totals[pid][stat] || 0) + val;
          }
        }
      }
    } catch {
      break; // Week doesn't exist yet (in-season) – stop fetching
    }
  }

  cacheSet(key, totals, TTL.SEASON_TOTALS);
  return totals;
}

/**
 * Aggregate remaining projected points from `currentWeek` to week 18.
 */
export async function fetchRemainingProjections(season, currentWeek, onProgress) {
  const key = `sleeper_remaining_proj_${season}_${currentWeek}`;
  const hit = cacheGet(key);
  if (hit) { onProgress?.(18 - currentWeek + 1, 18 - currentWeek + 1); return hit; }

  const totals = {};
  const weeks = Array.from({ length: 18 - currentWeek + 1 }, (_, i) => currentWeek + i);

  for (let i = 0; i < weeks.length; i++) {
    try {
      const wk = await fetchWeekProjections(season, weeks[i]);
      onProgress?.(i + 1, weeks.length);
      for (const [pid, stats] of Object.entries(wk)) {
        if (!totals[pid]) totals[pid] = {};
        for (const [stat, val] of Object.entries(stats)) {
          if (typeof val === 'number') {
            totals[pid][stat] = (totals[pid][stat] || 0) + val;
          }
        }
      }
    } catch {
      break;
    }
  }

  cacheSet(key, totals, TTL.SEASON_TOTALS);
  return totals;
}

export function clearSleeperCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('sleeper_'))
    .forEach(k => localStorage.removeItem(k));
}
