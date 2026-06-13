// 比赛相关 API
import { Router } from 'express';
import { getDb } from '../../db/schema';

export const matchesRouter = Router();

// 获取所有比赛
matchesRouter.get('/', (req, res) => {
  const db = getDb();
  const { stage, group, status } = req.query;

  let sql = 'SELECT * FROM matches WHERE 1=1';
  const params: unknown[] = [];

  if (stage && stage !== 'all') { sql += ' AND stage = ?'; params.push(stage); }
  if (group && group !== 'all') { sql += ' AND group_name = ?'; params.push(group); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }

  sql += ' ORDER BY kickoff_time ASC';

  const matches = db.all(sql, ...params);

  // 附带预测数据
  const matchesWithPredictions = matches.map((m: any) => {
    const pred = db.get(
      'SELECT * FROM predictions WHERE match_id = ?', m.match_id
    );
    return { ...m, prediction: pred ?? null };
  });

  res.json({ data: matchesWithPredictions });
});

// 获取单场比赛
matchesRouter.get('/:matchId', (req, res) => {
  const db = getDb();
  const { matchId } = req.params;

  const match = db.get('SELECT * FROM matches WHERE match_id = ?', matchId);
  if (!match) return res.status(404).json({ error: '比赛不存在' });

  const prediction = db.get('SELECT * FROM predictions WHERE match_id = ?', matchId);
  const odds = db.all(
    'SELECT * FROM odds WHERE match_id = ? ORDER BY fetched_at DESC LIMIT 20',
    matchId
  );

  res.json({ data: { ...match, prediction: prediction ?? null, odds } });
});

// 获取小组所有比赛
matchesRouter.get('/group/:groupName', (req, res) => {
  const db = getDb();
  const matches = db.all(
    'SELECT * FROM matches WHERE group_name = ? ORDER BY kickoff_time ASC',
    req.params.groupName
  );
  res.json({ data: matches });
});

// 手动更新赛果 (管理功能)
matchesRouter.put('/:matchId/result', (req, res) => {
  const db = getDb();
  const { matchId } = req.params;
  const { scoreA, scoreB } = req.body;

  if (scoreA === undefined || scoreB === undefined) {
    return res.status(400).json({ error: '需要 scoreA 和 scoreB' });
  }

  db.run(
    "UPDATE matches SET score_a = ?, score_b = ?, status = 'finished' WHERE match_id = ?",
    scoreA, scoreB, matchId
  );

  res.json({ data: { matchId, scoreA, scoreB, status: 'finished' } });
});
