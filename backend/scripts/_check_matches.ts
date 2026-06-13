import initSqlJs from 'sql.js';
import fs from 'fs';

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('data/wc-predictor.db'));
  const res = db.exec("SELECT match_id, team_a, team_b, kickoff_time, stage FROM matches WHERE status='upcoming' AND team_a!='TBD' ORDER BY kickoff_time ASC LIMIT 20");
  if (res.length && res[0].values.length) {
    for (const row of res[0].values) {
      console.log(row.join(' | '));
    }
  }
  // Check if odds table has any data
  const oddsRes = db.exec("SELECT COUNT(*) as cnt FROM odds");
  // Also list configured odds sources
  const teamRes = db.exec("SELECT name, name_en, elo_rating FROM teams ORDER BY elo_rating DESC LIMIT 10");
})();
