// 生成完整的 2026 世界杯赛程
// 12 组 × 4 队 = 48 队, 72 场小组赛 + 32 场淘汰赛 = 104 场
import { initDb, createTables, getDb } from '../src/db/schema';
import { WC2026_TEAMS } from '../src/utils/football';

// 2026 世界杯 12 个小组
const GROUPS: Record<string, string[]> = {
  A: ['墨西哥', '南非', '韩国', '捷克'],
  B: ['加拿大', '波黑', '卡塔尔', '瑞士'],
  C: ['巴西', '摩洛哥', '海地', '苏格兰'],
  D: ['美国', '巴拉圭', '澳大利亚', '土耳其'],
  E: ['德国', '库拉索', '科特迪瓦', '厄瓜多尔'],
  F: ['荷兰', '日本', '瑞典', '突尼斯'],
  G: ['比利时', '埃及', '伊朗', '新西兰'],
  H: ['西班牙', '佛得角', '沙特阿拉伯', '乌拉圭'],
  I: ['法国', '塞内加尔', '伊拉克', '挪威'],
  J: ['阿根廷', '阿尔及利亚', '奥地利', '约旦'],
  K: ['葡萄牙', '刚果民主共和国', '乌兹别克斯坦', '哥伦比亚'],
  L: ['英格兰', '克罗地亚', '加纳', '巴拿马'],
};

// 小组赛日期安排 (June 11-27, 每个比赛日 ~4 场)
// 按比赛日分组: matchday 1 (June 11-17), matchday 2 (June 18-24), matchday 3 (June 24-27)
interface MatchData {
  matchId: string;
  teamA: string;
  teamB: string;
  matchday: 1 | 2 | 3;
  date: string;
  venue: string;
  city: string;
}

// 小组赛对阵: 每组的 6 场对阵 (4 取 2)
// matchday 1: 1v2, 3v4 | matchday 2: 1v3, 2v4 | matchday 3: 1v4, 2v3
function generateGroupMatches(): MatchData[] {
  const matches: MatchData[] = [];
  const dates = {
    1: ['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17'],
    2: ['2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24'],
    3: ['2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27'],
  };

  const venues = [
    { venue: 'Estadio Azteca', city: 'Mexico City' },
    { venue: 'Estadio Akron', city: 'Guadalajara' },
    { venue: 'BMO Field', city: 'Toronto' },
    { venue: 'BC Place', city: 'Vancouver' },
    { venue: 'SoFi Stadium', city: 'Los Angeles' },
    { venue: "Levi's Stadium", city: 'San Francisco' },
    { venue: 'MetLife Stadium', city: 'New York/New Jersey' },
    { venue: 'Gillette Stadium', city: 'Boston' },
    { venue: 'AT&T Stadium', city: 'Dallas' },
    { venue: 'NRG Stadium', city: 'Houston' },
    { venue: 'Mercedes-Benz Stadium', city: 'Atlanta' },
    { venue: 'Hard Rock Stadium', city: 'Miami' },
    { venue: 'Lincoln Financial Field', city: 'Philadelphia' },
    { venue: 'Lumen Field', city: 'Seattle' },
    { venue: 'Arrowhead Stadium', city: 'Kansas City' },
    { venue: 'Estadio BBVA', city: 'Monterrey' },
  ];

  let matchCounter = 0;
  for (const [group, teams] of Object.entries(GROUPS)) {
    // matchday 1: 1v2, 3v4
    // matchday 2: 1v3, 2v4
    // matchday 3: 1v4, 2v3
    const pairs = [
      { m: 1, a: teams[0], b: teams[1] },
      { m: 1, a: teams[2], b: teams[3] },
      { m: 2, a: teams[0], b: teams[2] },
      { m: 2, a: teams[1], b: teams[3] },
      { m: 3, a: teams[0], b: teams[3] },
      { m: 3, a: teams[1], b: teams[2] },
    ];

    for (const p of pairs) {
      const dayIdx = Math.floor(matchCounter / 12); // distribute across dates
      const dateIdx = Math.min(dayIdx, dates[p.m as 1|2|3].length - 1);
      const date = dates[p.m as 1|2|3][dateIdx];
      const venueIdx = matchCounter % venues.length;

      matches.push({
        matchId: `${group}${p.m}-${p.a === teams[0] ? (p.b === teams[1] ? '1' : p.b === teams[2] ? '2' : '3') : p.a === teams[2] ? '4' : '5'}`,
        teamA: p.a,
        teamB: p.b,
        matchday: p.m as 1 | 2 | 3,
        date,
        venue: venues[venueIdx].venue,
        city: venues[venueIdx].city,
      });
      matchCounter++;
    }
  }

  return matches;
}

const KNOCKOUT_TEMPLATES: MatchData[] = [
  // Round of 32 placeholder (16 matches)
  ...[...Array(16)].map((_, i) => ({
    matchId: `R32-${i + 1}`,
    teamA: 'TBD',
    teamB: 'TBD',
    matchday: 4 as any,
    date: `2026-06-${28 + Math.floor(i / 4)}T${12 + (i % 3) * 4}:00:00`,
    venue: 'TBD',
    city: 'TBD',
  })),
  // Round of 16 (8 matches)
  ...[...Array(8)].map((_, i) => ({
    matchId: `R16-${i + 1}`,
    teamA: 'TBD',
    teamB: 'TBD',
    matchday: 5 as any,
    date: `2026-07-0${4 + Math.floor(i / 4)}T${12 + (i % 3) * 4}:00:00`,
    venue: 'TBD',
    city: 'TBD',
  })),
  // Quarter-finals (4 matches)
  ...[...Array(4)].map((_, i) => ({
    matchId: `QF-${i + 1}`,
    teamA: 'TBD',
    teamB: 'TBD',
    matchday: 6 as any,
    date: `2026-07-0${9 + i}T20:00:00`,
    venue: 'TBD',
    city: 'TBD',
  })),
  // Semi-finals (2 matches)
  { matchId: 'SF-1', teamA: 'TBD', teamB: 'TBD', matchday: 7 as any, date: '2026-07-14T20:00:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { matchId: 'SF-2', teamA: 'TBD', teamB: 'TBD', matchday: 7 as any, date: '2026-07-15T20:00:00', venue: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  // Third place
  { matchId: '3RD', teamA: 'TBD', teamB: 'TBD', matchday: 8 as any, date: '2026-07-18T15:00:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  // Final
  { matchId: 'FINAL', teamA: 'TBD', teamB: 'TBD', matchday: 8 as any, date: '2026-07-19T15:00:00', venue: 'MetLife Stadium', city: 'New York/New Jersey' },
];

function getStage(matchId: string): string {
  if (matchId.startsWith('R32')) return 'round32';
  if (matchId.startsWith('R16')) return 'round16';
  if (matchId.startsWith('QF')) return 'quarter';
  if (matchId.startsWith('SF')) return 'semi';
  if (matchId === '3RD') return 'third';
  if (matchId === 'FINAL') return 'final';
  return 'group';
}

async function main() {
  await initDb();
  createTables();

  const db = getDb();

  // 清除旧数据
  db.run('DELETE FROM odds');
  db.run('DELETE FROM predictions');
  db.run('DELETE FROM matches');

  const groupMatches = generateGroupMatches();
  const allMatches = [...groupMatches, ...KNOCKOUT_TEMPLATES];

  for (const m of allMatches) {
    db.run(
      `INSERT OR REPLACE INTO matches (match_id, stage, group_name, matchday, team_a, team_b, kickoff_time, venue, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.matchId,
      getStage(m.matchId),
      m.matchId[0].match(/[A-L]/) ? m.matchId[0] : null,
      m.matchday,
      m.teamA,
      m.teamB,
      m.date,
      m.venue,
      m.city
    );
  }

  console.log(`[赛程生成] 共 ${allMatches.length} 场比赛`);
  console.log(`  小组赛: ${groupMatches.length} 场`);
  console.log(`  淘汰赛: ${allMatches.length - groupMatches.length} 场`);

  // 同时重新导入球队 (确保与赛程一致)
  db.run('DELETE FROM teams');
  for (const team of WC2026_TEAMS) {
    const elo = team.elo;
    const attack = Math.pow(10, (elo - 1500) / 400);
    const defense = 1 / attack;
    db.run(
      `INSERT INTO teams (name, name_en, fifa_code, confederation, elo_rating, attack_strength, defense_strength)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      team.name, team.name_en, team.fifa_code, team.confederation, team.elo, attack, defense
    );
  }
  console.log(`[球队] ${WC2026_TEAMS.length} 支球队`);
}

main().catch(err => { console.error(err); process.exit(1); });
