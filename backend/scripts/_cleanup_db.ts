import { initDb, getDb } from '../src/db/schema';

(async () => {
  await initDb();
  const db = getDb();
  const all = db.all("SELECT match_id, team_a, team_b, kickoff_time, group_name FROM matches ORDER BY kickoff_time") as any[];
  console.log('Total matches:', all.length);
  console.log('Real (wc2026_):', all.filter((m: any) => m.match_id.startsWith('wc2026_')).length);
  console.log('Old (fictional):', all.filter((m: any) => !m.match_id.startsWith('wc2026_')).length);

  if (all.length > 30) {
    db.run("DELETE FROM matches WHERE match_id NOT LIKE 'wc2026_%'");
    db.run("DELETE FROM predictions WHERE match_id NOT LIKE 'wc2026_%'");
    db.run("DELETE FROM odds WHERE match_id NOT LIKE 'wc2026_%'");
    console.log('Cleaned up old fictional matches');
  }

  const remaining = db.all("SELECT COUNT(*) as c FROM matches")[0] as any;
  console.log('Remaining matches:', remaining.c);

  // Also check odds
  const oddsCount = db.all("SELECT COUNT(*) as c FROM odds")[0] as any;
  console.log('Odds records:', oddsCount.c);

  // List all matches
  for (const m of all.filter((m: any) => m.match_id.startsWith('wc2026_'))) {
    console.log(`${m.kickoff_time} | ${m.team_a} vs ${m.team_b} | ${m.group_name}`);
  }
})();
