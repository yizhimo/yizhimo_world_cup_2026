import { initDb, getDb } from '../src/db/schema';
(async () => {
  await initDb();
  const db = getDb();
  const odds = db.all("SELECT match_id, source, home_odds, draw_odds, away_odds, margin FROM odds LIMIT 5") as any[];
  console.log(JSON.stringify(odds, null, 2));
  const cnt = db.all("SELECT COUNT(*) as c FROM odds")[0] as any;
  console.log('Total odds records:', cnt.c);
})();
