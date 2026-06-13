// 为 2026 世界杯 48 支球队设置 Elo 评分
// 数据来源: eloratings.net (2026年6月) + 合理估算
import { initDb, getDb } from '../src/db/schema';

// Top ~16 来自 eloratings.net 确认数据, 其余根据近期趋势估算
const ELOS: Record<string, number> = {
  // Group A
  'Mexico': 1868, 'South Africa': 1610, 'South Korea': 1780, 'Czech Republic': 1790,
  // Group B
  'Canada': 1720, 'Bosnia and Herzegovina': 1690, 'Qatar': 1570, 'Switzerland': 1870,
  // Group C
  'Brazil': 1988, 'Morocco': 1683, 'Haiti': 1500, 'Scotland': 1790,
  // Group D
  'United States': 1742, 'Paraguay': 1660, 'Australia': 1710, 'Turkey': 1790,
  // Group E
  'Germany': 1925, 'Curacao': 1470, 'Ivory Coast': 1730, 'Ecuador': 1760,
  // Group F
  'Netherlands': 1961, 'Japan': 1906, 'Sweden': 1830, 'Tunisia': 1670,
  // Group G
  'Belgium': 1866, 'Egypt': 1710, 'Iran': 1710, 'New Zealand': 1540,
  // Group H
  'Spain': 2165, 'Cape Verde': 1530, 'Saudi Arabia': 1570, 'Uruguay': 1892,
  // Group I
  'France': 2081, 'Senegal': 1790, 'Iraq': 1540, 'Norway': 1820,
  // Group J
  'Argentina': 2113, 'Algeria': 1710, 'Austria': 1840, 'Jordan': 1490,
  // Group K
  'Portugal': 1984, 'DR Congo': 1590, 'Uzbekistan': 1590, 'Colombia': 1977,
  // Group L
  'England': 2020, 'Croatia': 1930, 'Ghana': 1670, 'Panama': 1550,
};

async function main() {
  await initDb();
  const db = getDb();

  // 删除中文名球队 (保留英文名)
  const allTeams = db.all("SELECT name, name_en FROM teams") as any[];
  for (const t of allTeams) {
    if (/[一-鿿]/.test(t.name)) {
      db.run("DELETE FROM teams WHERE name = ?", t.name);
    }
  }

  let updated = 0;
  for (const [name, elo] of Object.entries(ELOS)) {
    const team = db.get<{ name: string }>("SELECT name FROM teams WHERE name = ?", name);
    if (team) {
      db.run("UPDATE teams SET elo_rating = ? WHERE name = ?", elo, name);
      updated++;
    } else {
      db.run("INSERT INTO teams (name, elo_rating) VALUES (?, ?)", name, elo);
      updated++;
    }
  }

  console.log(`Updated ${updated} team Elo ratings`);

  // 展示前后对比
  const all = db.all("SELECT name, elo_rating FROM teams ORDER BY elo_rating DESC") as any[];
  console.log('\nTop 20 teams (June 2026):');
  for (const t of all.slice(0, 20)) console.log(`  ${t.name}: ${t.elo_rating}`);
}

main().catch(console.error);
