// 数据库层 — 基于 sql.js (纯 JavaScript/WASM，无需编译)
// @ts-ignore - sql.js 无类型声明
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'wc-predictor.db');

let SQL: SqlJsStatic | null = null;
let db: SqlJsDatabase | null = null;

// 兼容 better-sqlite3 API 的包装类
class DbWrapper {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  // 执行非查询 SQL (CREATE/INSERT/UPDATE/DELETE)
  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
    // sql.js 的 run 不支持参数绑定，需要手动替换
    const compiled = this.compileSql(sql, params);
    this.db.run(compiled);
    const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] as number ?? 0;
    const changes = this.db.getRowsModified();
    this.save();
    return { changes, lastInsertRowid: lastId };
  }

  // 查询单行
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    const compiled = this.compileSql(sql, params);
    const result = this.db.exec(compiled);
    if (!result.length || !result[0].values.length) return undefined;
    return this.rowToObject<T>(result[0]);
  }

  // 查询所有行
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    const compiled = this.compileSql(sql, params);
    const result = this.db.exec(compiled);
    if (!result.length) return [];
    return result[0].values.map((_row: unknown[], rowIdx: number) => this.rowToObject<T>(result[0], rowIdx));
  }

  // 执行多语句
  exec(sql: string): void {
    this.db.run(sql);
    this.save();
  }

  // sql.js 不支持预编译语句，手动替换参数 (简单实现，注意防注入)
  private compileSql(sql: string, params: unknown[]): string {
    if (!params.length) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => {
      const val = params[idx++];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return `'${String(val)}'`;
    });
  }

  private rowToObject<T>(result: { columns: string[]; values: unknown[][] }, rowIdx = 0): T {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      obj[col] = result.values[rowIdx][i];
    });
    return obj as T;
  }

  // 持久化到文件
  save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 初始化数据库 (异步)
export async function initDb(): Promise<void> {
  if (db) return;

  SQL = await initSqlJs();

  // 尝试从文件加载
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
}

// 获取数据库实例 (同步，必须先调用 initDb)
export function getDb(): DbWrapper {
  if (!db) throw new Error('数据库未初始化，请先调用 initDb()');
  return new DbWrapper(db);
}

// 创建表结构
export function createTables(): void {
  const wrapper = getDb();

  wrapper.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      name_en TEXT,
      fifa_code TEXT UNIQUE,
      confederation TEXT,
      elo_rating REAL DEFAULT 1500,
      attack_strength REAL DEFAULT 1.0,
      defense_strength REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL UNIQUE,
      stage TEXT NOT NULL,
      group_name TEXT,
      matchday INTEGER,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      kickoff_time TEXT NOT NULL,
      venue TEXT,
      city TEXT,
      score_a INTEGER,
      score_b INTEGER,
      status TEXT DEFAULT 'upcoming',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL UNIQUE,
      poisson_home_prob REAL,
      poisson_draw_prob REAL,
      poisson_away_prob REAL,
      poisson_expected_goals_a REAL,
      poisson_expected_goals_b REAL,
      elo_home_prob REAL,
      elo_draw_prob REAL,
      elo_away_prob REAL,
      final_home_prob REAL NOT NULL,
      final_draw_prob REAL NOT NULL,
      final_away_prob REAL NOT NULL,
      top_scores TEXT,
      recommended_bet TEXT,
      value_edge REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS odds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      source TEXT NOT NULL,
      home_odds REAL,
      draw_odds REAL,
      away_odds REAL,
      score_odds TEXT,
      home_implied_prob REAL,
      draw_implied_prob REAL,
      away_implied_prob REAL,
      margin REAL,
      fetched_at TEXT DEFAULT (datetime('now')),
      UNIQUE(match_id, source, fetched_at)
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      bet_type TEXT NOT NULL CHECK(bet_type IN ('1X2', 'correct_score')),
      selection TEXT NOT NULL,
      model_prob REAL NOT NULL,
      odds REAL NOT NULL,
      odds_source TEXT,
      value_edge REAL,
      stake REAL NOT NULL,
      kelly_fraction TEXT,
      actual_outcome TEXT,
      result TEXT DEFAULT 'pending' CHECK(result IN ('win','loss','push','pending')),
      payout REAL,
      balance_after REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      settled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bankroll_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL NOT NULL,
      change REAL NOT NULL,
      reason TEXT NOT NULL,
      bet_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (bet_id) REFERENCES bets(id)
    );

    CREATE TABLE IF NOT EXISTS strategy_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS personal_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      bet_type TEXT NOT NULL DEFAULT '1X2',
      selection TEXT NOT NULL,
      stake REAL NOT NULL,
      odds REAL,
      model_home_prob REAL,
      model_draw_prob REAL,
      model_away_prob REAL,
      score_prediction TEXT,
      result TEXT DEFAULT 'pending' CHECK(result IN ('win','loss','push','pending')),
      payout REAL,
      balance_after REAL,
      notes TEXT,
      actual_score TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      settled_at TEXT
    );
  `);

  // 插入默认策略配置
  const existing = wrapper.get<{ count: number }>("SELECT COUNT(*) as count FROM strategy_config");
  if (!existing || existing.count === 0) {
    const configs = [
      ['auto_update_enabled', 'true'],
      ['odds_api_key', 'YOUR_API_KEY_HERE'],
      ['initial_bankroll', '2000'],
      ['kelly_fraction', '0.25'],
      ['value_threshold', '0.05'],
      ['max_stake_pct', '0.15'],
      ['poisson_weight', '0.25'],
      ['elo_weight', '0.45'],
      ['market_weight', '0.30'],
      ['streak_loss_limit', '3'],
      ['streak_critical_limit', '5'],
      ['current_bankroll', '500'],
    ];
    for (const [key, value] of configs) {
      wrapper.run(
        "INSERT OR IGNORE INTO strategy_config (key, value) VALUES (?, ?)",
        key, value
      );
    }
  }

  // 插入初始资金记录
  const histExists = wrapper.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM bankroll_history"
  );
  if (!histExists || histExists.count === 0) {
    wrapper.run(
      "INSERT INTO bankroll_history (balance, change, reason) VALUES (?, ?, ?)",
      500, 500, '初始资金'
    );
  }

  // 迁移: 为 personal_bets 添加 balance_after 列 (如果不存在)
  try {
    wrapper.run("ALTER TABLE personal_bets ADD COLUMN balance_after REAL");
  } catch {
    // 列已存在，忽略
  }
}
