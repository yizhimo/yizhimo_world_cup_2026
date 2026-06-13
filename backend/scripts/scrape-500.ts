// 爬取 500.com 竞彩足球赔率 → 更新 matches + odds 表
import https from 'https';
import http from 'http';
import iconv from 'iconv-lite';
import { getDb, initDb, createTables } from '../src/db/schema';

const URL = 'https://trade.500.com/jczq/';

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve(iconv.decode(Buffer.concat(chunks), 'gb2312'));
      });
    }).on('error', reject);
  });
}

// 中文队名 → 英文映射
const CN_TO_EN: Record<string, string> = {
  '墨西哥': 'Mexico', '南非': 'South Africa',
  '韩国': 'South Korea', '捷克': 'Czech Republic',
  '加拿大': 'Canada', '波黑': 'Bosnia and Herzegovina',
  '美国': 'United States', '巴拉圭': 'Paraguay',
  '卡塔尔': 'Qatar', '瑞士': 'Switzerland',
  '巴西': 'Brazil', '摩洛哥': 'Morocco',
  '海地': 'Haiti', '苏格兰': 'Scotland',
  '澳大利亚': 'Australia', '土耳其': 'Turkey',
  '德国': 'Germany', '库拉索': 'Curacao',
  '荷兰': 'Netherlands', '日本': 'Japan',
  '科特迪瓦': 'Ivory Coast', '厄瓜多尔': 'Ecuador',
  '瑞典': 'Sweden', '突尼斯': 'Tunisia',
  '比利时': 'Belgium', '埃及': 'Egypt',
  '西班牙': 'Spain', '佛得角': 'Cape Verde',
  '沙特阿拉伯': 'Saudi Arabia', '乌拉圭': 'Uruguay',
  '伊朗': 'Iran', '新西兰': 'New Zealand',
  '法国': 'France', '塞内加尔': 'Senegal',
  '伊拉克': 'Iraq', '挪威': 'Norway',
  '阿根廷': 'Argentina', '阿尔及利亚': 'Algeria',
  '奥地利': 'Austria', '约旦': 'Jordan',
  '葡萄牙': 'Portugal', '刚果(金)': 'DR Congo',
  '英格兰': 'England', '克罗地亚': 'Croatia',
  '加纳': 'Ghana', '巴拿马': 'Panama',
  '乌兹别克': 'Uzbekistan', '哥伦比亚': 'Colombia',
  '北爱尔兰': 'Northern Ireland', '秘鲁': 'Peru',
  '意大利': 'Italy', '丹麦': 'Denmark',
  '波兰': 'Poland', '塞尔维亚': 'Serbia',
  '尼日利亚': 'Nigeria', '哥斯达黎加': 'Costa Rica',
  '冰岛': 'Iceland', '俄罗斯': 'Russia',
  '威尔士': 'Wales', '喀麦隆': 'Cameroon',
  '智利': 'Chile', '委内瑞拉': 'Venezuela',
};

// 小组映射 (从真实赛程)
const GROUP_MAP: Record<string, string> = {
  'Mexico': 'A', 'South Africa': 'A', 'South Korea': 'A', 'Czech Republic': 'A',
  'Canada': 'B', 'Bosnia and Herzegovina': 'B', 'Qatar': 'B', 'Switzerland': 'B',
  'Brazil': 'C', 'Morocco': 'C', 'Haiti': 'C', 'Scotland': 'C',
  'United States': 'D', 'Paraguay': 'D', 'Australia': 'D', 'Turkey': 'D',
  'Germany': 'E', 'Curacao': 'E', 'Ivory Coast': 'E', 'Ecuador': 'E',
  'Netherlands': 'F', 'Japan': 'F', 'Sweden': 'F', 'Tunisia': 'F',
  'Belgium': 'G', 'Egypt': 'G', 'Iran': 'G', 'New Zealand': 'G',
  'Spain': 'H', 'Cape Verde': 'H', 'Saudi Arabia': 'H', 'Uruguay': 'H',
  'France': 'I', 'Senegal': 'I', 'Iraq': 'I', 'Norway': 'I',
  'Argentina': 'J', 'Algeria': 'J', 'Austria': 'J', 'Jordan': 'J',
  'Portugal': 'K', 'DR Congo': 'K', 'Uzbekistan': 'K', 'Colombia': 'K',
  'England': 'L', 'Croatia': 'L', 'Ghana': 'L', 'Panama': 'L',
};

async function main() {
  await initDb();
  createTables();
  const db = getDb();

  console.log('Fetching 500.com...');
  const html = await fetchPage(URL);

  // 提取所有世界杯比赛的完整行
  const rows = html.split('<tr class="bet-tb-tr"');
  let newMatches = 0, newOdds = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const trEnd = row.indexOf('</tr>');
    const fullRow = row.substring(0, trEnd > 0 ? trEnd : row.length);

    if (!fullRow.includes('世界杯')) continue;

    const getAttr = (name: string) => {
      const m = fullRow.match(new RegExp(`data-${name}="([^"]*)"`));
      return m ? m[1] : '';
    };

    const homesx = getAttr('homesxname');
    const awaysx = getAttr('awaysxname');
    const matchDate = getAttr('matchdate');
    const matchTime = getAttr('matchtime');
    const fixtureId = getAttr('fixtureid');

    const homeEn = CN_TO_EN[homesx];
    const awayEn = CN_TO_EN[awaysx];
    if (!homeEn || !awayEn) {
      console.log(`  Skip: ${homesx} vs ${awaysx} (no mapping)`);
      continue;
    }

    const kickoffTime = `${matchDate}T${matchTime}:00`;
    const groupName = GROUP_MAP[homeEn] || '';
    const matchId = `wc2026_${fixtureId}`;

    console.log(`\n${matchDate} ${matchTime} | ${homesx}(${homeEn}) vs ${awaysx}(${awayEn}) | Group ${groupName}`);

    // Extract SPF odds (胜平负) from B2 row
    let homeOdds = 0, drawOdds = 0, awayOdds = 0;

    // Try B2 row first (胜平负)
    const b2Match = fullRow.match(/<div class="betbtn-row itm-rangB2">([\s\S]*?)<\/div>/);
    if (b2Match) {
      const spfMatches = b2Match[1].matchAll(/data-type="spf"[^>]*data-sp="([^"]*)"/g);
      const odds = [...spfMatches].map(m => parseFloat(m[1]));
      if (odds.length >= 3) [homeOdds, drawOdds, awayOdds] = odds;
    }

    // If no SPF, try B1 (让球胜平负)
    if (!homeOdds) {
      const b1Match = fullRow.match(/<div class="betbtn-row itm-rangB1">([\s\S]*?)<\/div>/);
      if (b1Match) {
        const nspfMatches = b1Match[1].matchAll(/data-type="nspf"[^>]*data-sp="([^"]*)"/g);
        const odds = [...nspfMatches].map(m => parseFloat(m[1]));
        if (odds.length >= 3) [homeOdds, drawOdds, awayOdds] = odds;
      }
    }

    console.log(`  Odds: ${homeOdds || 'N/A'} / ${drawOdds || 'N/A'} / ${awayOdds || 'N/A'}`);

    // Upsert match
    const existingMatch = db.get<{ match_id: string }>(
      "SELECT match_id FROM matches WHERE match_id = ?", matchId
    );

    if (!existingMatch) {
      db.run(
        `INSERT INTO matches (match_id, stage, group_name, team_a, team_b, kickoff_time, status)
         VALUES (?, 'group', ?, ?, ?, ?, 'upcoming')`,
        matchId, groupName, homeEn, awayEn, kickoffTime
      );
      newMatches++;
    } else {
      // Update existing
      db.run(
        "UPDATE matches SET team_a=?, team_b=?, kickoff_time=?, group_name=?, status='upcoming' WHERE match_id=?",
        homeEn, awayEn, kickoffTime, groupName, matchId
      );
    }

    // Upsert odds
    if (homeOdds > 0) {
      const homeImp = Math.round((1 / homeOdds) * 10000) / 10000;
      const drawImp = Math.round((1 / drawOdds) * 10000) / 10000;
      const awayImp = Math.round((1 / awayOdds) * 10000) / 10000;
      const margin = Math.round((homeImp + drawImp + awayImp - 1) * 10000) / 10000;

      // Remove old odds for this source+date
      db.run("DELETE FROM odds WHERE match_id = ? AND source = '500.com'", matchId);

      db.run(
        `INSERT INTO odds (match_id, source, home_odds, draw_odds, away_odds,
         home_implied_prob, draw_implied_prob, away_implied_prob, margin)
         VALUES (?, '500.com', ?, ?, ?, ?, ?, ?, ?)`,
        matchId, homeOdds, drawOdds, awayOdds,
        homeImp, drawImp, awayImp, margin
      );
      newOdds++;
    }

    // Ensure teams exist
    for (const tn of [homeEn, awayEn]) {
      const team = db.get<{ name: string }>("SELECT name FROM teams WHERE name = ?", tn);
      if (!team) {
        db.run("INSERT INTO teams (name, elo_rating) VALUES (?, 1500)", tn);
        console.log(`  Added team: ${tn}`);
      }
    }
  }

  // Clean up old generated matches that aren't real
  const realIds = rows
    .filter(r => r.includes('世界杯'))
    .map(r => {
      const m = r.match(/data-fixtureid="([^"]*)"/);
      return m ? `wc2026_${m[1]}` : '';
    })
    .filter(Boolean);

  console.log(`\n=== Summary ===`);
  console.log(`New matches inserted: ${newMatches}`);
  console.log(`Odds stored: ${newOdds}`);
  console.log(`Real match IDs: ${realIds.length}`);
}

main().catch(console.error);
