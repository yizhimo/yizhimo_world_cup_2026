// 赔率数据获取 — 对接 The-Odds-API (免费层: 500 req/month)
// API 文档: https://the-odds-api.com/liveapi/guides/v4/
import axios from 'axios';
import { getDb } from '../db/schema';
import { removeMargin } from '../betting/value';

const BASE_URL = 'https://api.the-odds-api.com/v4';

interface OddsApiMatch {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{ name: string; price: number }>;
    }>;
  }>;
}

interface ScrapedOdds {
  matchId: string;
  source: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  homeImpliedProb: number;
  drawImpliedProb: number;
  awayImpliedProb: number;
  margin: number;
}

// 获取 API Key (从 strategy_config)
function getApiKey(): string | null {
  try {
    const db = getDb();
    const row = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'odds_api_key'"
    );
    if (!row || !row.value || row.value === 'YOUR_API_KEY_HERE') return null;
    return row.value;
  } catch {
    return null;
  }
}

// 队名映射: 英文 → 中文 (匹配数据库中的球队)
const TEAM_NAME_MAP: Record<string, string> = {
  'Mexico': '墨西哥', 'South Africa': '南非', 'South Korea': '韩国', 'Czechia': '捷克',
  'Canada': '加拿大', 'Bosnia and Herzegovina': '波黑', 'Qatar': '卡塔尔', 'Switzerland': '瑞士',
  'Brazil': '巴西', 'Morocco': '摩洛哥', 'Haiti': '海地', 'Scotland': '苏格兰',
  'USA': '美国', 'Paraguay': '巴拉圭', 'Australia': '澳大利亚', 'Türkiye': '土耳其',
  'Germany': '德国', 'Curaçao': '库拉索', "Côte d'Ivoire": '科特迪瓦', 'Ecuador': '厄瓜多尔',
  'Netherlands': '荷兰', 'Japan': '日本', 'Sweden': '瑞典', 'Tunisia': '突尼斯',
  'Belgium': '比利时', 'Egypt': '埃及', 'Iran': '伊朗', 'New Zealand': '新西兰',
  'Spain': '西班牙', 'Cabo Verde': '佛得角', 'Saudi Arabia': '沙特阿拉伯', 'Uruguay': '乌拉圭',
  'France': '法国', 'Senegal': '塞内加尔', 'Iraq': '伊拉克', 'Norway': '挪威',
  'Argentina': '阿根廷', 'Algeria': '阿尔及利亚', 'Austria': '奥地利', 'Jordan': '约旦',
  'Portugal': '葡萄牙', 'DR Congo': '刚果民主共和国', 'Uzbekistan': '乌兹别克斯坦', 'Colombia': '哥伦比亚',
  'England': '英格兰', 'Croatia': '克罗地亚', 'Ghana': '加纳', 'Panama': '巴拿马',
};

// 尝试多种 sport_key 获取世界杯赔率
const SPORT_KEYS = [
  'soccer_world_cup_winner',
  'soccer_fifa_world_cup',
  'soccer_world_cup',
];

function findMatchId(homeTeam: string, awayTeam: string): { matchId: string; swapped: boolean } | null {
  const db = getDb();
  const homeCn = TEAM_NAME_MAP[homeTeam] || homeTeam;
  const awayCn = TEAM_NAME_MAP[awayTeam] || awayTeam;

  // 精确匹配
  let match = db.get<{ match_id: string }>(
    "SELECT match_id FROM matches WHERE team_a = ? AND team_b = ? AND status = 'upcoming'",
    homeCn, awayCn
  );
  if (match) return { matchId: match.match_id, swapped: false };

  // 交换主客场再试 (API 主客顺序和 DB 相反，需要交换赔率)
  match = db.get<{ match_id: string }>(
    "SELECT match_id FROM matches WHERE team_a = ? AND team_b = ? AND status = 'upcoming'",
    awayCn, homeCn
  );
  if (match) return { matchId: match.match_id, swapped: true };

  // 模糊匹配
  match = db.get<{ match_id: string }>(
    "SELECT match_id FROM matches WHERE (team_a = ? OR team_a = ?) AND (team_b = ? OR team_b = ?) AND status = 'upcoming'",
    homeCn, awayCn, awayCn, homeCn
  );

  return match ? { matchId: match.match_id, swapped: false } : null;
}

interface ApiUsage {
  requestsRemaining: number;
  requestsUsed: number;
  requestsLast: number;
}

let lastApiUsage: ApiUsage | null = null;

export function getApiUsage(): ApiUsage | null {
  return lastApiUsage;
}

// 保存 API 使用情况到数据库
function saveApiUsage(usage: ApiUsage): void {
  lastApiUsage = usage;
  try {
    const db = getDb();
    db.run(
      "INSERT OR REPLACE INTO strategy_config (key, value) VALUES ('api_requests_remaining', ?)",
      String(usage.requestsRemaining)
    );
    db.run(
      "INSERT OR REPLACE INTO strategy_config (key, value) VALUES ('api_requests_used', ?)",
      String(usage.requestsUsed)
    );
    db.run(
      "INSERT OR REPLACE INTO strategy_config (key, value) VALUES ('api_requests_updated', ?)",
      String(Date.now())
    );
  } catch { /* ignore */ }
}

// 从 Odds API 获取赔率
async function fetchOddsFromApi(sportKey: string, apiKey: string, region: string): Promise<OddsApiMatch[]> {
  const url = `${BASE_URL}/sports/${sportKey}/odds/`;
  const response = await axios.get(url, {
    params: {
      apiKey,
      regions: region,
      markets: 'h2h',
      oddsFormat: 'decimal',
    },
    timeout: 15000,
  });
  const remaining = parseInt(response.headers['x-requests-remaining'] || '0', 10);
  const used = parseInt(response.headers['x-requests-used'] || '0', 10);
  const last = parseInt(response.headers['x-requests-last'] || '0', 10);
  if (remaining > 0 || used > 0) {
    saveApiUsage({ requestsRemaining: remaining, requestsUsed: used, requestsLast: last });
  }
  return response.data;
}

export async function scrapeOdds(apiKey?: string): Promise<ScrapedOdds[]> {
  const key = apiKey || getApiKey();
  if (!key) {
    console.log('[赔率] 未配置 API Key，跳过自动爬取');
    console.log('[赔率] 请到 https://the-odds-api.com 注册免费 Key，然后在设置页填入');
    return [];
  }

  console.log('[赔率] 开始从 The-Odds-API 获取赔率...');
  const allMatches: OddsApiMatch[] = [];

  for (const sportKey of SPORT_KEYS) {
    try {
      // 尝试多个地区
      for (const region of ['uk', 'eu', 'us']) {
        try {
          const data = await fetchOddsFromApi(sportKey, key, region);
          if (data.length > 0) {
            console.log(`[赔率] ${sportKey} (${region}): ${data.length} 场比赛`);
            allMatches.push(...data);
            break; // 成功就跳出地区循环
          }
        } catch (err) {
          // 该地区可能没有数据，继续尝试下一个
        }
      }
      if (allMatches.length > 0) break; // 找到数据就跳出 sport 循环
    } catch (err) {
      // 尝试下一个 sport_key
    }
  }

  if (allMatches.length === 0) {
    console.log('[赔率] 未找到世界杯比赛赔率 (可能尚未发布)');
    return [];
  }

  const results: ScrapedOdds[] = [];
  let matchedCount = 0;

  for (const match of allMatches) {
    const found = findMatchId(match.home_team, match.away_team);
    if (!found) {
      // 尝试记录未匹配的队名用于调试
      continue;
    }
    matchedCount++;

    // 对每个博彩公司分别保存
    for (const bookmaker of match.bookmakers) {
      const h2h = bookmaker.markets.find(m => m.key === 'h2h');
      if (!h2h) continue;

      const homeOutcome = h2h.outcomes.find(o => o.name === match.home_team);
      const awayOutcome = h2h.outcomes.find(o => o.name === match.away_team);
      const drawOutcome = h2h.outcomes.find(o => o.name === 'Draw');

      if (!homeOutcome || !awayOutcome || !drawOutcome) continue;

      let homeOdds = homeOutcome.price;
      let drawOdds = drawOutcome.price;
      let awayOdds = awayOutcome.price;

      // API 主客顺序和 DB 相反时，交换主客赔率
      if (found.swapped) {
        [homeOdds, awayOdds] = [awayOdds, homeOdds];
      }

      const implied = removeMargin({ home: homeOdds, draw: drawOdds, away: awayOdds });

      results.push({
        matchId: found.matchId,
        source: bookmaker.key,
        homeOdds,
        drawOdds,
        awayOdds,
        homeImpliedProb: implied.home,
        drawImpliedProb: implied.draw,
        awayImpliedProb: implied.away,
        margin: implied.margin,
      });
    }
  }

  console.log(`[赔率] 匹配 ${matchedCount}/${allMatches.length} 场, 共 ${results.length} 条赔率记录`);
  return results;
}

// 保存赔率到数据库
export function saveOdds(odds: ScrapedOdds[]): number {
  const db = getDb();
  let saved = 0;

  for (const o of odds) {
    if (o.homeOdds > 1.0 && o.drawOdds > 1.0 && o.awayOdds > 1.0) {
      db.run(
        `INSERT INTO odds (match_id, source, home_odds, draw_odds, away_odds,
          home_implied_prob, draw_implied_prob, away_implied_prob, margin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        o.matchId, o.source, o.homeOdds, o.drawOdds, o.awayOdds,
        o.homeImpliedProb, o.drawImpliedProb, o.awayImpliedProb, o.margin
      );
      saved++;
    }
  }

  if (saved > 0) console.log(`[赔率] 保存 ${saved} 条赔率到数据库`);
  return saved;
}

// 完整流程: 爬取 + 保存
export async function runScraping(): Promise<number> {
  const odds = await scrapeOdds();
  if (odds.length === 0) return 0;
  return saveOdds(odds);
}
