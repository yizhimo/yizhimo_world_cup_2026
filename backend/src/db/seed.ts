// 初始数据填充：球队 + 赛程
import { getDb } from './schema';
import { WC2026_TEAMS, GROUP_STAGE_SCHEDULE } from '../utils/football';
import { setElo } from '../models/elo';
import { estimateFromElo, setTeamParams } from '../models/poisson';

export function seedData(): void {
  const db = getDb();

  // 检查是否已填充
  const teamCount = db.get<{ count: number }>('SELECT COUNT(*) as count FROM teams');
  if (teamCount && teamCount.count > 0) {
    return;
  }

  console.log('[种子数据] 填充球队和赛程数据...');

  // 插入球队
  for (const team of WC2026_TEAMS) {
    const params = estimateFromElo(team.elo);
    db.run(
      `INSERT INTO teams (name, name_en, fifa_code, confederation, elo_rating, attack_strength, defense_strength)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      team.name, team.name_en, team.fifa_code, team.confederation, team.elo,
      params.attack, params.defense
    );
    setElo(team.name, team.elo);
    setTeamParams(team.name, params);
  }
  console.log(`[种子数据] 插入 ${WC2026_TEAMS.length} 支球队`);

  // 插入赛程
  for (const m of GROUP_STAGE_SCHEDULE) {
    db.run(
      `INSERT OR IGNORE INTO matches (match_id, stage, group_name, matchday, team_a, team_b, kickoff_time, venue, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.matchId, m.stage, m.group, m.matchday, m.teamA, m.teamB, m.kickoff, m.venue, m.city
    );
  }
  console.log(`[种子数据] 插入 ${GROUP_STAGE_SCHEDULE.length} 场小组赛`);
}
