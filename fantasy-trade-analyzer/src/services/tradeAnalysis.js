// ── Default scoring settings ────────────────────────────────────────────────

export const DEFAULT_SCORING_SETTINGS = {
  // Passing
  pass_td: 4,
  pass_yd: 0.04,       // 1 pt per 25 yds
  pass_int: -2,
  pass_2pt: 2,
  // Rushing
  rush_td: 6,
  rush_yd: 0.1,        // 1 pt per 10 yds
  rush_2pt: 2,
  // Receiving
  rec_td: 6,
  rec_yd: 0.1,
  rec: 1,              // 1 = PPR, 0.5 = half-PPR, 0 = standard
  te_premium: 0,       // extra pts per TE catch
  // Misc
  fum_lost: -2,
  bonus_pass_yd_300: 0,
  bonus_rush_yd_100: 0,
  bonus_rec_yd_100: 0,
};

export const SCORING_PRESETS = {
  ppr: { label: 'PPR', overrides: { rec: 1, te_premium: 0 } },
  half_ppr: { label: 'Half-PPR', overrides: { rec: 0.5, te_premium: 0 } },
  standard: { label: 'Standard', overrides: { rec: 0, te_premium: 0 } },
  teppr: { label: 'TE-Premium (PPR+0.5)', overrides: { rec: 1, te_premium: 0.5 } },
};

export const DEFAULT_ROSTER_SETTINGS = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DEF: 1, BENCH: 6,
};

// ── Draft pick dynasty values ────────────────────────────────────────────────

export const DRAFT_PICK_VALUES = {
  '1.01': 92, '1.02': 88, '1.03': 84, '1.04': 80, '1.05': 76,
  '1.06': 72, '1.07': 68, '1.08': 64, '1.09': 60, '1.10': 56,
  '1.11': 52, '1.12': 48,
  '2.01': 46, '2.02': 44, '2.03': 42, '2.04': 40, '2.05': 38,
  '2.06': 36, '2.07': 34, '2.08': 32, '2.09': 30, '2.10': 28,
  '2.11': 26, '2.12': 24,
  '3.01': 22, '3.02': 21, '3.03': 20, '3.04': 19, '3.05': 18,
  '3.06': 17, '3.07': 16, '3.08': 15, '3.09': 14, '3.10': 13,
  '3.11': 12, '3.12': 11,
  'early_1st': 82, 'mid_1st': 64, 'late_1st': 50,
  'early_2nd': 45, 'mid_2nd': 33, 'late_2nd': 25,
  'early_3rd': 21, 'mid_3rd': 16, 'late_3rd': 12,
  'early_4th': 8,  'mid_4th': 6,  'late_4th': 4,
};

// ── Core calculations ────────────────────────────────────────────────────────

export function calcPlayerPoints(stats, s) {
  if (!stats) return 0;
  let pts = 0;
  pts += (stats.pass_td  || 0) * (s.pass_td  ?? 4);
  pts += (stats.pass_yd  || 0) * (s.pass_yd  ?? 0.04);
  pts += (stats.pass_int || 0) * (s.pass_int ?? -2);
  pts += (stats.rush_td  || 0) * (s.rush_td  ?? 6);
  pts += (stats.rush_yd  || 0) * (s.rush_yd  ?? 0.1);
  pts += (stats.rec_td   || 0) * (s.rec_td   ?? 6);
  pts += (stats.rec_yd   || 0) * (s.rec_yd   ?? 0.1);
  pts += (stats.rec      || 0) * (s.rec      ?? 1);
  // TE premium
  if (s.te_premium && stats.rec) pts += stats.rec * s.te_premium;
  pts += (stats.fum_lost || 0) * (s.fum_lost ?? -2);
  // Bonus yardage milestones
  if (s.bonus_pass_yd_300 && (stats.pass_yd || 0) >= 300) pts += s.bonus_pass_yd_300;
  if (s.bonus_rush_yd_100 && (stats.rush_yd || 0) >= 100) pts += s.bonus_rush_yd_100;
  if (s.bonus_rec_yd_100  && (stats.rec_yd  || 0) >= 100) pts += s.bonus_rec_yd_100;
  return Math.round(pts * 10) / 10;
}

const INJURY_MODIFIERS = {
  Active: 1.0, '': 1.0,
  Questionable: 0.88, Doubtful: 0.45, Out: 0.05, IR: 0.05, PUP: 0.0, COV: 0.0, NA: 0.0,
};

export function injuryMod(status) {
  return INJURY_MODIFIERS[status ?? 'Active'] ?? 0.85;
}

// ── Roster analysis ─────────────────────────────────────────────────────────

export function buildPositionGroups(players, stats, scoring) {
  const groups = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  for (const p of players) {
    const raw = calcPlayerPoints(stats[p.sleeper_id], scoring);
    const adj = raw * injuryMod(p.injury_status);
    const pos = p.position;
    if (groups[pos] !== undefined) groups[pos].push({ ...p, rawPoints: raw, adjPoints: adj });
  }
  for (const pos of Object.keys(groups)) {
    groups[pos].sort((a, b) => b.adjPoints - a.adjPoints);
  }
  return groups;
}

export function calcStarterScore(groups, roster) {
  const slots = {
    QB: roster.QB ?? 1, RB: roster.RB ?? 2, WR: roster.WR ?? 2,
    TE: roster.TE ?? 1, FLEX: roster.FLEX ?? 1, SUPERFLEX: roster.SUPERFLEX ?? 0,
    K: roster.K ?? 1, DEF: roster.DEF ?? 1,
  };
  const used = new Set();
  let total = 0;
  const starters = [];

  const take = (pos, count) => {
    const avail = (groups[pos] || []).filter(p => !used.has(p.sleeper_id));
    avail.slice(0, count).forEach(p => {
      used.add(p.sleeper_id); total += p.adjPoints; starters.push({ ...p, slot: pos });
    });
  };

  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => take(pos, slots[pos]));

  // FLEX: best remaining RB/WR/TE
  const flexPool = [...(groups.RB||[]), ...(groups.WR||[]), ...(groups.TE||[])]
    .filter(p => !used.has(p.sleeper_id))
    .sort((a, b) => b.adjPoints - a.adjPoints);
  flexPool.slice(0, slots.FLEX).forEach(p => {
    used.add(p.sleeper_id); total += p.adjPoints; starters.push({ ...p, slot: 'FLEX' });
  });

  // SUPERFLEX: best remaining QB/RB/WR/TE
  if (slots.SUPERFLEX > 0) {
    const sfPool = [...(groups.QB||[]), ...(groups.RB||[]), ...(groups.WR||[]), ...(groups.TE||[])]
      .filter(p => !used.has(p.sleeper_id))
      .sort((a, b) => b.adjPoints - a.adjPoints);
    sfPool.slice(0, slots.SUPERFLEX).forEach(p => {
      used.add(p.sleeper_id); total += p.adjPoints; starters.push({ ...p, slot: 'SUPERFLEX' });
    });
  }

  return { total: Math.round(total * 10) / 10, starters };
}

function positionalNeeds(groups, roster) {
  const needs = {};
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const count = groups[pos]?.length ?? 0;
    const req = roster[pos] ?? (pos === 'QB' || pos === 'TE' ? 1 : 2);
    needs[pos] = count < req ? 'critical' : count < req + 2 ? 'thin' : 'deep';
  }
  return needs;
}

function assetValue(player, stats, scoring) {
  if (player.isDraftPick) return DRAFT_PICK_VALUES[player.pick_id] ?? 20;
  const raw = calcPlayerPoints(stats[player.sleeper_id], scoring);
  return raw * injuryMod(player.injury_status);
}

// ── Main trade analysis ──────────────────────────────────────────────────────

export function analyzeTrade({ team1, team2, stats, scoring, roster }) {
  // team1.roster / team2.roster = full current rosters
  // team1.gives / team1.gets   = players crossing the wire

  const gives1 = team1.gives.map(p => p.sleeper_id || p.id);
  const gives2 = team2.gives.map(p => p.sleeper_id || p.id);

  const after1 = [
    ...team1.roster.filter(p => !gives1.includes(p.sleeper_id || p.id)),
    ...team1.gets.filter(p => !p.isDraftPick),
  ];
  const after2 = [
    ...team2.roster.filter(p => !gives2.includes(p.sleeper_id || p.id)),
    ...team2.gets.filter(p => !p.isDraftPick),
  ];

  const g1b = buildPositionGroups(team1.roster, stats, scoring);
  const g1a = buildPositionGroups(after1, stats, scoring);
  const g2b = buildPositionGroups(team2.roster, stats, scoring);
  const g2a = buildPositionGroups(after2, stats, scoring);

  const s1b = calcStarterScore(g1b, roster);
  const s1a = calcStarterScore(g1a, roster);
  const s2b = calcStarterScore(g2b, roster);
  const s2a = calcStarterScore(g2a, roster);

  const delta1 = s1a.total - s1b.total;
  const delta2 = s2a.total - s2b.total;

  const val1Gets = team1.gets.reduce((s, p) => s + assetValue(p, stats, scoring), 0);
  const val1Gives = team1.gives.reduce((s, p) => s + assetValue(p, stats, scoring), 0);

  const impactDiff = delta1 - delta2; // positive = team1 wins
  const valueDiff = val1Gets - val1Gives; // positive = team1 gets more raw value

  const needs1 = positionalNeeds(g1b, roster);
  const needs2 = positionalNeeds(g2b, roster);

  const verdict = computeVerdict(valueDiff, impactDiff);

  return {
    team1: { before: s1b, after: s1a, delta: delta1, getsValue: val1Gets, givesValue: val1Gives, needs: needs1 },
    team2: { before: s2b, after: s2a, delta: delta2, getsValue: val1Gives, givesValue: val1Gets, needs: needs2 },
    valueDiff,
    impactDiff,
    verdict,
    winner: impactDiff > 1 ? 'team1' : impactDiff < -1 ? 'team2' : 'even',
  };
}

function computeVerdict(valueDiff, impactDiff) {
  if (Math.abs(valueDiff) < 15 && Math.abs(impactDiff) < 4) return 'even';
  if (impactDiff > 25) return 'team1_wins_big';
  if (impactDiff > 8)  return 'team1_wins';
  if (impactDiff < -25) return 'team2_wins_big';
  if (impactDiff < -8)  return 'team2_wins';
  if (valueDiff > 35)  return 'team1_value_big';
  if (valueDiff > 12)  return 'team1_value';
  if (valueDiff < -35) return 'team2_value_big';
  if (valueDiff < -12) return 'team2_value';
  return 'even';
}

// ── Funny verdict messages ───────────────────────────────────────────────────

const VERDICTS = {
  team1_wins_big: (t1, t2, gives, gets) => [
    `🚨 GRAND LARCENY DETECTED! ${t1} just robbed ${t2} at statistical gunpoint. Trading away ${gives} and getting ${gets} back? ${t2}, your fantasy opponent is printing your face on a dartboard right now.`,
    `🏆 CERTIFIED HEIST. ${t1} deserves a trophy and possibly a prison sentence. ${t2} handed over the crown jewels for a gas station gift card. The fantasy gods are shaking their heads.`,
    `💰 CALL THE COMMISSIONER. ${t1} executed a trade so lopsided that ${t2}'s remaining roster filed a missing persons report on their own relevance.`,
  ],
  team1_wins: (t1, t2) => [
    `✅ ${t1} gets the W here. Not a robbery, more like a strongly-negotiated lunch deal where ${t2} forgot they were paying. Solid pickup.`,
    `📈 Good trade, ${t1}! You saw the value, you took it. ${t2} thought they were being slick. Spoiler: they were not.`,
    `👍 ${t1} edges this one. Nothing flashy, just good fantasy sense. ${t2} might feel fine about it now, then have a quiet cry by Week 10.`,
  ],
  team2_wins_big: (t1, t2, gives, gets) => [
    `🚨 ${t1.toUpperCase()}, PUT DOWN THE TRADE BUTTON AND STEP AWAY. You're giving ${gives} and getting ${gets}?! Your team's starters just called HR. This trade is a hate crime against your own fantasy squad.`,
    `😱 ${t1}, I've done the math seven times hoping I was wrong. I was not wrong. This deal is like trading a sports car for a bus pass. A soggy bus pass. In December. DECLINE IMMEDIATELY.`,
    `💀 ${t1}, your fantasy manager title is in jeopardy. ${t2} is somewhere right now trying really hard not to hit "accept" too fast and look suspicious. Every analyst, algorithm, and my grandma who doesn't watch football says this is a terrible deal for you.`,
    `🤦 ${t1}. Buddy. Pal. Amigo. I need you to sit down. This trade analysis broke my empathy circuits. The value differential is so bad I briefly considered filing a wellness check. PLEASE rethink this.`,
    `📉 Congratulations, ${t1}, you've found a creative new way to tank. ${t2} is doing the Macarena in private right now. This trade is the fantasy equivalent of benching Patrick Mahomes because "he looked tired."`,
  ],
  team2_wins: (t1, t2) => [
    `⚠️ ${t1}, this trade leans ${t2}'s way. Not catastrophic, but you're overpaying. ${t2} got the better meal at this restaurant and you're also leaving the tip.`,
    `😬 Slight lean to ${t2} here. ${t1}, are you filling a genuine need or just doing something because it felt exciting? Think about it. Sleep on it. Maybe don't accept this one.`,
    `🔻 ${t2} wins this trade on value and projected impact. ${t1}, you've been out-maneuvered. It happens. But it doesn't have to happen TODAY. You can still walk away.`,
  ],
  team1_value_big: (t1, t2) => [
    `💎 ${t1} wins big on raw value. The assets coming in are substantially better than what's going out. Great negotiating or ${t2} just wasn't paying attention — either way, nice pickup.`,
  ],
  team1_value: (t1, t2) => [
    `📊 Solid value edge for ${t1}. The numbers favor you here — you're getting back more than you're giving up on a pure asset basis.`,
  ],
  team2_value_big: (t1, t2) => [
    `⚖️ ${t2} gets the better value here by a significant margin. ${t1}, are you sure this is worth it? A need is a need, but you might be overpaying.`,
  ],
  team2_value: (t1, t2) => [
    `🤔 Slight value advantage for ${t2}. ${t1}, the deal isn't terrible, but you're giving up a little extra. Worth it only if it fills a true positional void.`,
  ],
  even: (t1, t2) => [
    `⚖️ This trade is shockingly balanced! Both sides identified a need and addressed it fairly. You might actually both be competent GMs. I'll update my assumptions accordingly.`,
    `🤝 Fair deal! Both teams come out roughly even in value and projected impact. This is what healthy fantasy trading looks like. Boring to analyze but smart to do.`,
    `✌️ Even-steven. No clear winner, no clear loser. Both teams get something useful. The commissioner can sleep well tonight knowing no one got fleeced.`,
  ],
};

export function generateVerdict(verdict, team1Name, team2Name, gives, gets) {
  const fn = VERDICTS[verdict] || VERDICTS.even;
  const pool = fn(team1Name, team2Name, gives, gets);
  return pool[Math.floor(Math.random() * pool.length)];
}
