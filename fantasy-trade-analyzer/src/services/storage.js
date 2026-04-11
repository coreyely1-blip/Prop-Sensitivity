const KEY = 'fta_app_data';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : defaultData();
  } catch {
    return defaultData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save app data:', e);
  }
}

function defaultData() {
  return { leagues: [], selectedLeagueId: null };
}

export { uid };
