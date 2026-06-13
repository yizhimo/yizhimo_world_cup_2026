// 数据加载器：将历史比赛数据导入 SQLite
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { getDb } from '../db/schema';

interface HistoricalMatch {
  date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  tournament: string;
  city: string;
  country: string;
  neutral: string;
}

// 加载 CSV 数据
export function loadHistoricalData(): HistoricalMatch[] {
  const csvPath = path.join(__dirname, '..', '..', 'data', 'historical', 'results.csv');

  if (!fs.existsSync(csvPath)) {
    console.warn('[数据加载] results.csv 未找到，请先运行 npm run download-data');
    return [];
  }

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  }) as HistoricalMatch[];

  console.log(`[数据加载] 加载了 ${records.length} 场历史比赛`);
  return records;
}

// 筛选世界杯相关比赛（用于回测）
export function filterWorldCupMatches(matches: HistoricalMatch[]): HistoricalMatch[] {
  return matches.filter(m =>
    m.tournament.toLowerCase().includes('fifa world cup') ||
    m.tournament.toLowerCase().includes('world cup')
  );
}

// 筛选近 N 年比赛
export function filterRecentMatches(matches: HistoricalMatch[], years: number): HistoricalMatch[] {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return matches.filter(m => new Date(m.date) >= cutoff);
}
