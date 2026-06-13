// 投注历史页
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/utils';

interface Bet {
  id: number; match_id: string; team_a: string; team_b: string;
  bet_type: string; selection: string; model_prob: number; odds: number;
  odds_source: string; stake: number; result: string; payout: number;
  balance_after: number; created_at: string; settled_at: string | null;
}

const RESULT_LABELS: Record<string, string> = { win: '赢', loss: '输', push: '走水', pending: '待结算' };
const RESULT_COLORS: Record<string, string> = {
  win: 'bg-green-100 text-green-700', loss: 'bg-red-100 text-red-700',
  push: 'bg-yellow-100 text-yellow-700', pending: 'bg-gray-100 text-gray-500',
};

export function BetHistory() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    apiGet<{ data: Bet[] }>('/bets').then(r => setBets(r.data));
  }, []);

  const filtered = filter === 'all' ? bets : bets.filter(b => b.result === filter);

  const totalPnl = filtered.reduce((s, b) => s + ((b.payout ?? 0) - b.stake), 0);
  const latestBalance = filtered.length > 0 ? filtered[0].balance_after : 200;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">投注记录</h2>
        <div className="flex gap-2">
          {['all', 'pending', 'win', 'loss'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-white border'
              }`}
            >
              {f === 'all' ? '全部' : RESULT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border text-center text-gray-400">
          暂无投注记录 — 前往 <a href="/matches" className="text-primary-600 underline">比赛</a> 开始分析
        </div>
      ) : (
        <>
          {/* 盈亏汇总 */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-lg p-3 shadow-sm border text-center">
              <p className="text-xs text-gray-500">显示投注</p>
              <p className="text-xl font-bold">{filtered.length}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border text-center">
              <p className="text-xs text-gray-500">盈亏</p>
              <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalPnl >= 0 ? '+' : ''}¥{totalPnl.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border text-center">
              <p className="text-xs text-gray-500">当前余额</p>
              <p className="text-xl font-bold">¥{latestBalance?.toFixed(2) ?? '—'}</p>
            </div>
          </div>

          {/* 投注列表 */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="py-3 px-4">比赛</th>
                  <th className="py-3 px-2">玩法</th>
                  <th className="py-3 px-2">选项</th>
                  <th className="py-3 px-2">赔率</th>
                  <th className="py-3 px-2">金额</th>
                  <th className="py-3 px-2">结果</th>
                  <th className="py-3 px-2">派彩</th>
                  <th className="py-3 px-2">时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="text-xs text-gray-400 mr-1">{b.match_id}</span>
                      {b.team_a} vs {b.team_b}
                    </td>
                    <td className="py-3 px-2">{b.bet_type === '1X2' ? '胜平负' : '比分'}</td>
                    <td className="py-3 px-2 font-medium">{b.selection}</td>
                    <td className="py-3 px-2">{b.odds?.toFixed(2)}</td>
                    <td className="py-3 px-2">¥{b.stake?.toFixed(0)}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${RESULT_COLORS[b.result]}`}>
                        {RESULT_LABELS[b.result] ?? b.result}
                      </span>
                    </td>
                    <td className={`py-3 px-2 ${b.result === 'win' ? 'text-success' : b.result === 'loss' ? 'text-danger' : ''}`}>
                      {b.payout != null ? '¥' + b.payout.toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-400">
                      {new Date(b.created_at).toLocaleDateString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
