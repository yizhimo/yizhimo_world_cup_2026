// 投注相关 API
import { Router } from 'express';
import { createBet, settleBet, getAllBets, getBet, deleteBet } from '../../tracker/bet-tracker';

export const betsRouter = Router();

// 获取所有投注
betsRouter.get('/', (req, res) => {
  const { status, betType, limit, offset } = req.query;
  const bets = getAllBets({
    status: status as string,
    betType: betType as string,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  res.json({ data: bets });
});

// 创建投注
betsRouter.post('/', (req, res) => {
  try {
    const betId = createBet(req.body);
    const bet = getBet(betId);
    res.status(201).json({ data: bet });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 获取单笔投注
betsRouter.get('/:betId', (req, res) => {
  const bet = getBet(Number(req.params.betId));
  if (!bet) return res.status(404).json({ error: '投注不存在' });
  res.json({ data: bet });
});

// 结算投注
betsRouter.put('/:betId/settle', (req, res) => {
  try {
    const { actualOutcome, isWin, push } = req.body;
    settleBet(Number(req.params.betId), actualOutcome, isWin, push ?? false);

    const bet = getBet(Number(req.params.betId));
    res.json({ data: bet, message: '结算完成' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 删除投注 (仅待结算)
betsRouter.delete('/:betId', (req, res) => {
  const success = deleteBet(Number(req.params.betId));
  if (!success) return res.status(400).json({ error: '无法删除已结算的投注' });
  res.json({ message: '已删除' });
});
