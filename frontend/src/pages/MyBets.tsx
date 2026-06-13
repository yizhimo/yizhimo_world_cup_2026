// 我的投注 — 按轮次推进，¥2000预算
import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiPut, teamDisplay } from '@/lib/utils';

interface Summary {
  bankroll: number; available: number; totalStaked: number; totalReturned: number;
  totalPnl: number; totalBets: number; settled: number;
  wins: number; losses: number; winRate: number; goal: number; progress: number;
}

interface OutcomeData { prob: number; odds: number; edge: number; stake: number; }
interface ScoreItem { score: string; prob: number; odds: number; stake: number; }
interface MatchItem {
  matchId: string; teamA: string; teamB: string; kickoffTime: string;
  topScores: ScoreItem[];
  outcomes: { home: OutcomeData; draw: OutcomeData; away: OutcomeData };
  canBet: boolean; alreadyBet: boolean;
}

interface RoundData {
  bankroll: number; riskWarnings: string[]; lossStreak: number;
  pendingCount: number; currentRound: string; roundLabel: string;
  nextRound: string | null; matches: MatchItem[];
}

interface PersonalBet {
  id: number; match_id: string; team_a: string; team_b: string; selection: string;
  stake: number; odds: number | null; result: string; payout: number | null;
  balance_after: number | null; actual_score: string | null; notes: string | null;
  created_at: string; settled_at: string | null;
}

const CN: Record<string, string> = { home: '主胜', draw: '平局', away: '客胜' };
function labelSel(sel: string): string { return CN[sel] || sel; }


export function MyBets() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [bets, setBets] = useState<PersonalBet[]>([]);
  const [loading, setLoading] = useState(true);

  // bet mode: which match+outcome
  const [betting, setBetting] = useState<{ matchId: string; teamA: string; teamB: string; selection: string; odds: number } | null>(null);
  const [customStake, setCustomStake] = useState(0);
  const [msg, setMsg] = useState('');

  // settle mode
  const [settling, setSettling] = useState<PersonalBet | null>(null);
  const [settleResult, setSettleResult] = useState('');
  const [settlePayout, setSettlePayout] = useState(0);
  const [settleScore, setSettleScore] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  // edit mode
  const [editing, setEditing] = useState<PersonalBet | null>(null);
  const [editPayout, setEditPayout] = useState(0);
  const [editResult, setEditResult] = useState('');

  // init mode
  const [initOpen, setInitOpen] = useState(false);
  const [initAmount, setInitAmount] = useState(2000);
  const [initStep, setInitStep] = useState(0); // 0=输入, 1=确认

  const fetchData = useCallback((date?: string) => {
    setLoading(true);
    const adviceUrl = date ? `/my-bets/advice?date=${date}` : '/my-bets/advice';
    Promise.all([
      apiGet<{ data: Summary }>('/my-bets/summary'),
      apiGet<{ data: RoundData }>(adviceUrl),
      apiGet<{ data: PersonalBet[] }>('/my-bets'),
    ]).then(([s, a, b]) => {
      setSummary(s.data);
      setRound(a.data);
      setBets(b.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 下注
  const doBet = async () => {
    if (!betting || !customStake || customStake < 2) return;
    setMsg('投注中...');
    try {
      const r = await apiPost('/my-bets', {
        matchId: betting.matchId, teamA: betting.teamA, teamB: betting.teamB,
        selection: betting.selection, stake: customStake, odds: betting.odds,
      }) as { message: string };
      setMsg(r.message);
      setBetting(null); setCustomStake(0);
      setTimeout(() => { setMsg(''); fetchData(round?.currentRound); }, 500);
    } catch (err: any) {
      setMsg('失败: ' + (err?.message || '未知错误'));
    }
  };

  // 结算
  const doSettle = async () => {
    if (!settling || !settleResult) return;
    setMsg('结算中...');
    try {
      const body: Record<string, unknown> = { result: settleResult };
      if (settleResult === 'win') body.payout = settlePayout;
      if (settleScore) body.actualScore = settleScore;
      if (settleNotes) body.notes = settleNotes;
      const r = await apiPut(`/my-bets/${settling.id}/result`, body) as { message: string };
      setMsg(r.message);
      setSettling(null); setSettleResult(''); setSettlePayout(0); setSettleScore(''); setSettleNotes('');
      setTimeout(() => { setMsg(''); fetchData(round?.currentRound); }, 500);
    } catch (err: any) {
      setMsg('失败: ' + (err?.message || '未知错误'));
    }
  };

  // 删除待结算投注
  const cancelBet = async (id: number) => {
    if (!confirm('取消这笔投注？金额会退回。')) return;
    await fetch(`/api/my-bets/${id}`, { method: 'DELETE' });
    fetchData(round?.currentRound);
  };

  // 编辑投注
  const doEdit = async () => {
    if (!editing) return;
    setMsg('保存中...');
    try {
      const body: Record<string, unknown> = {};
      if (editResult) body.result = editResult;
      if (editResult === 'win' || (editResult === '' && editing.result === 'win')) {
        body.payout = editPayout;
      }
      await apiPut(`/my-bets/${editing.id}`, body);
      setMsg('已保存');
      setEditing(null);
      setTimeout(() => { setMsg(''); fetchData(round?.currentRound); }, 500);
    } catch (err: any) {
      setMsg('保存失败: ' + (err?.message || '未知错误'));
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">加载中...</div>;

  const pendingBets = bets.filter(b => b.result === 'pending');
  const roundMatchIds = new Set(round?.matches.map(m => m.matchId) || []);
  const roundPending = pendingBets.filter(b => roundMatchIds.has(b.match_id));
  const canAdvance = roundPending.length === 0;
  const pct = summary ? (summary.bankroll / summary.goal) * 100 : 0;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">我的投注</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setInitOpen(true); setInitStep(0); setInitAmount(summary?.bankroll ?? 2000); }}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
          >
            初始化
          </button>
          <button
            onClick={async () => {
              setMsg('刷新中...');
              try {
                await apiPost('/odds/scrape', {});
                await apiPost('/predictions/generate-all', {});
                setMsg('刷新完成！');
                setTimeout(() => { setMsg(''); fetchData(round?.currentRound); }, 500);
              } catch { setMsg('刷新失败'); }
            }}
            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
          >
            手动刷新
          </button>
        </div>
      </div>
      {msg && !betting && !settling && (
        <div className="mb-3 text-xs text-primary-600">{msg}</div>
      )}

      {/* 资金概况 */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: '余额', value: `¥${summary.bankroll.toFixed(2)}`, sub: `可用 ¥${summary.available.toFixed(2)}`, cls: 'text-primary-600' },
            { label: '盈亏', value: `${summary.totalPnl >= 0 ? '+' : ''}¥${summary.totalPnl.toFixed(2)}`, sub: `${summary.wins}胜${summary.losses}负`, cls: summary.totalPnl >= 0 ? 'text-success' : 'text-danger' },
            { label: '投注', value: `${summary.totalBets}笔`, sub: `命中率 ${summary.settled > 0 ? (summary.winRate * 100).toFixed(0) + '%' : '—'}`, cls: '' },
            {
              label: `起始 ¥${summary.goal.toFixed(2)}`, value: `${pct.toFixed(0)}%`, sub: summary.progress >= 0 ? `+¥${summary.progress.toFixed(2)}` : `-¥${Math.abs(summary.progress).toFixed(2)}`,
              cls: summary.progress >= 0 ? 'text-success' : 'text-danger',
            },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl p-3 shadow-sm border">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* 风险 + 结算提示 */}
      {round?.riskWarnings?.map((w, i) => (
        <div key={i} className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">{w}</div>
      ))}
      {!canAdvance && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          本轮还有 {roundPending.length} 笔投注待结算，结算完成后可进入下一轮
        </div>
      )}

      {/* 左右布局: 比赛卡片 + 投注记录 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 左侧: 比赛卡片 */}
        <div className="col-span-2">
          {round && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">
                  {round.roundLabel} · {round.matches.length} 场比赛
                </h3>
                {canAdvance && round.nextRound && (
                  <button
                    onClick={() => fetchData(round.nextRound!)}
                    className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                  >
                    下一轮 →
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {round.matches.map(m => (
                  <div key={m.matchId} className={`bg-white rounded-xl p-3 shadow-sm border ${m.alreadyBet ? 'border-blue-200 bg-blue-50/30' : ''}`}>
                    {/* 对战信息 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{m.matchId}</span>
                        <span className="font-semibold text-sm">{teamDisplay(m.teamA)} vs {teamDisplay(m.teamB)}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(m.kickoffTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {m.alreadyBet && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">已投注</span>}
                    </div>

                    {/* 概率条 */}
                    <div className="flex items-center gap-1 mb-1">
                      <div className="flex-1 flex rounded-md overflow-hidden h-5 text-xs font-medium">
                        <div className="bg-blue-500 text-white flex items-center justify-center" style={{ width: `${(m.outcomes.home.prob * 100)}%` }}>
                          {m.outcomes.home.prob > 0.15 ? `${(m.outcomes.home.prob * 100).toFixed(0)}%` : ''}
                        </div>
                        <div className="bg-gray-300 text-gray-600 flex items-center justify-center" style={{ width: `${(m.outcomes.draw.prob * 100)}%` }}>
                          {m.outcomes.draw.prob > 0.15 ? `${(m.outcomes.draw.prob * 100).toFixed(0)}%` : ''}
                        </div>
                        <div className="bg-red-400 text-white flex items-center justify-center" style={{ width: `${(m.outcomes.away.prob * 100)}%` }}>
                          {m.outcomes.away.prob > 0.15 ? `${(m.outcomes.away.prob * 100).toFixed(0)}%` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 px-1 mb-1.5">
                      <span>{teamDisplay(m.teamA)}胜</span><span>平</span><span>{teamDisplay(m.teamB)}胜</span>
                    </div>

                    {/* 比分投注 */}
                    <div className="mb-2">
                      <p className="text-[10px] text-gray-400 mb-1">比分预测</p>
                      <div className="grid grid-cols-3 gap-1">
                        {m.topScores.map((s) => (
                          <div key={s.score} className="rounded border border-gray-200 bg-white p-1 text-center text-xs">
                            <div className="font-mono font-bold text-sm">{s.score}</div>
                            <div className="text-gray-500">{s.prob.toFixed(1)}%{s.odds ? ` @ ${s.odds.toFixed(1)}` : ''}</div>
                            {s.stake > 0 && (
                              <div className="text-amber-700 text-[10px]">建议 ¥{s.stake}</div>
                            )}
                            {m.canBet && !m.alreadyBet && (
                              <button
                                onClick={() => {
                                  setBetting({
                                    matchId: m.matchId, teamA: m.teamA, teamB: m.teamB,
                                    selection: `score:${s.score}`, odds: s.odds,
                                  });
                                  setCustomStake(s.stake || 10);
                                }}
                                className="mt-0.5 w-full py-0.5 bg-amber-500 text-white rounded text-[10px] font-medium hover:bg-amber-600"
                              >
                                下注比分
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 三个投注选项 */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['home', 'draw', 'away'] as const).map(key => {
                        const o = m.outcomes[key];
                        const hasRealOdds = o.edge !== 0;
                        const edgePct = (o.edge * 100).toFixed(1);
                        const isValue = o.edge > 0;

                        return (
                          <div key={key} className={`rounded-lg border p-1.5 text-center text-xs ${
                            isValue ? 'border-amber-300 bg-amber-50/50' : 'border-gray-100 bg-gray-50'
                          }`}>
                            <div className="font-medium mb-0.5">
                              {key === 'home' ? teamDisplay(m.teamA) + '胜' : key === 'away' ? teamDisplay(m.teamB) + '胜' : '平局'}
                            </div>
                            <div className="text-gray-500 mb-0.5">
                              {(o.prob * 100).toFixed(0)}%
                              <span className="ml-0.5">@ {o.odds.toFixed(2)}</span>
                              {!hasRealOdds && <span className="text-[10px] text-gray-300 ml-0.5">估</span>}
                            </div>
                            {hasRealOdds && isValue && (
                              <div className="text-success font-medium mb-0.5">+{edgePct}% 价值</div>
                            )}
                            {o.stake > 0 && !isValue && (
                              <div className="text-gray-500 mb-0.5">建议 ¥{o.stake}</div>
                            )}
                            {o.stake > 0 && isValue && (
                              <div className="text-amber-700 mb-0.5 font-medium">建议 ¥{o.stake}</div>
                            )}
                            {m.canBet && !m.alreadyBet && (
                              <button
                                onClick={() => {
                                  setBetting({ matchId: m.matchId, teamA: m.teamA, teamB: m.teamB, selection: key, odds: o.odds });
                                  setCustomStake(o.stake || 20);
                                }}
                                className={`w-full text-xs py-0.5 rounded font-medium ${
                                  isValue ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                }`}
                              >
                                下注
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {round.matches.length === 0 && (
                <p className="text-gray-400 text-sm py-8 text-center">没有即将到来的比赛</p>
              )}
            </>
          )}
        </div>

        {/* 右侧: 投注记录 */}
        <div>
          <h3 className="font-semibold text-sm mb-2 text-gray-500">投注记录</h3>
          {bets.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">暂无投注</p>
          ) : (
            <div className="space-y-1">
              {bets.map(b => {
                const isPending = b.result === 'pending';
                const isWin = b.result === 'win';
                const isLoss = b.result === 'loss';
                const isEditing = editing?.id === b.id;
                return (
                  <div key={b.id} className={`rounded-lg p-2 text-xs ${
                    isEditing ? 'bg-yellow-50 border border-yellow-300'
                    : isPending ? 'bg-blue-50 border border-blue-100'
                      : isWin ? 'bg-green-50 border border-green-100'
                      : isLoss ? 'bg-red-50 border border-red-100'
                      : 'bg-gray-50 border border-gray-100'
                  }`}>
                    {isEditing ? (
                      /* 编辑模式 */
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-400">#{b.id} 编辑中</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                          <div>
                            <label className="text-[10px] text-gray-400">结果</label>
                            <select value={editResult} onChange={e => setEditResult(e.target.value)}
                              className="w-full border rounded px-1.5 py-0.5 text-xs mt-0.5">
                              <option value="">不变</option>
                              <option value="win">赢</option>
                              <option value="loss">输</option>
                              <option value="push">走水</option>
                              <option value="pending">退回待结算</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400">派彩 (¥)</label>
                            <input
                              type="number" step="0.01"
                              value={editPayout || ''}
                              onChange={e => setEditPayout(parseFloat(e.target.value) || 0)}
                              className="w-full border rounded px-1.5 py-0.5 text-xs mt-0.5"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={doEdit}
                            className="px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] hover:bg-primary-700">保存</button>
                          <button onClick={() => setEditing(null)}
                            className="px-2 py-0.5 border rounded text-[10px] hover:bg-gray-100">取消</button>
                        </div>
                      </div>
                    ) : (
                      /* 正常显示模式 */
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-gray-400">#{b.id}</span>
                            <span>{teamDisplay(b.team_a)} vs {teamDisplay(b.team_b)}</span>
                          </div>
                          {isWin && (
                            <span className={`font-bold ${(b.payout || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                              {(b.payout || 0) >= 0 ? '+' : ''}¥{(b.payout || 0).toFixed(2)}
                            </span>
                          )}
                          {isLoss && <span className="text-danger font-bold">-¥{b.stake.toFixed(2)}</span>}
                          {b.result === 'push' && <span className="text-gray-400">走水</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">
                            {labelSel(b.selection)} · ¥{b.stake.toFixed(2)}
                            {b.odds ? ` @${b.odds.toFixed(2)}` : ''}
                            {b.actual_score ? ` | ${b.actual_score}` : ''}
                            {b.notes ? ` | 💬${b.notes}` : ''}
                            {b.balance_after != null ? ` | 余额 ¥${b.balance_after.toFixed(2)}` : ''}
                          </span>
                          <div className="flex gap-1">
                            {isPending ? (
                              <>
                                <button onClick={() => { setSettling(b); setSettleResult(''); setSettlePayout(0); setSettleScore(''); setSettleNotes(''); }}
                                  className="px-1.5 py-0.5 bg-white border rounded hover:bg-gray-50">结算</button>
                                <button onClick={() => cancelBet(b.id)}
                                  className="px-1.5 py-0.5 text-gray-400 hover:text-danger">取消</button>
                              </>
                            ) : (
                              <button onClick={() => {
                                setEditing(b);
                                setEditPayout(b.payout ?? 0);
                                setEditResult('');
                              }}
                                className="px-1.5 py-0.5 text-gray-400 hover:text-primary-600 border rounded text-[10px]">编辑</button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 下注弹窗 */}
      {betting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setBetting(null)}>
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">下注</h3>
            <p className="text-sm text-gray-500 mb-3">{teamDisplay(betting.teamA)} vs {teamDisplay(betting.teamB)} — {labelSel(betting.selection)}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">投注金额 (¥)</label>
                <input
                  type="number" min={2} max={summary?.available ?? 2000} step="0.01"
                  value={customStake || ''}
                  onChange={e => setCustomStake(parseFloat(e.target.value) || 0)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">可用余额 ¥{summary?.available?.toFixed(2)}</p>
              </div>
              {betting.odds > 0 && (
                <div className="text-xs text-gray-500">赔率: {betting.odds.toFixed(2)}</div>
              )}
            </div>
            {msg && <p className={`text-xs mt-2 ${msg.includes('失败') ? 'text-danger' : 'text-success'}`}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setBetting(null); setMsg(''); }} className="flex-1 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={doBet} disabled={!customStake || customStake < 2}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                确认 ¥{(customStake || 0).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 结算弹窗 */}
      {settling && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSettling(null)}>
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">结算</h3>
            <p className="text-sm text-gray-500 mb-3">
              {teamDisplay(settling.team_a)} vs {teamDisplay(settling.team_b)} — {labelSel(settling.selection)} — ¥{settling.stake.toFixed(2)}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">比赛结果</label>
                <select value={settleResult} onChange={e => setSettleResult(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="">请选择</option>
                  <option value="win">预测正确 (中奖)</option>
                  <option value="loss">预测错误 (未中)</option>
                  <option value="push">走水 (退款)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">实际比分 (如 2-1)</label>
                <input
                  type="text" value={settleScore}
                  onChange={e => setSettleScore(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  placeholder="可选，输入比赛最终比分"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">备注 (选填)</label>
                <input
                  type="text" value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  placeholder="例如: 运气好、裁判偏哨、伤病影响..."
                />
              </div>
              {settleResult === 'win' && (
                <div>
                  <label className="text-xs text-gray-500">中奖金额 (¥)，可填负数</label>
                  <input
                    type="number" step="0.01"
                    value={settlePayout || ''}
                    onChange={e => setSettlePayout(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                    placeholder="输入中国体彩实际派奖金额"
                    autoFocus
                  />
                </div>
              )}
            </div>
            {msg && <p className={`text-xs mt-2 ${msg.includes('失败') ? 'text-danger' : 'text-success'}`}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setSettling(null); setSettleNotes(''); setMsg(''); }} className="flex-1 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={doSettle}
                disabled={!settleResult}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                确认结算
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 初始化弹窗 */}
      {initOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setInitOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3">初始化</h3>
            {initStep === 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-3">设置起始资金，将清空所有投注记录并回到第一轮。</p>
                <div>
                  <label className="text-xs text-gray-500">起始资金 (¥)</label>
                  <input
                    type="number" min={100} max={100000} step="0.01"
                    value={initAmount || ''}
                    onChange={e => setInitAmount(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setInitOpen(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">取消</button>
                  <button onClick={() => setInitStep(1)} disabled={!initAmount || initAmount < 100}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                    下一步
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
                  <p className="font-medium">确认初始化？</p>
                  <p className="text-xs mt-1">起始资金: ¥{initAmount.toFixed(2)}</p>
                  <p className="text-xs mt-0.5">所有投注记录将被清除，回到第一轮比赛</p>
                </div>
                {msg && <p className={`text-xs mb-2 ${msg.includes('失败') ? 'text-danger' : 'text-success'}`}>{msg}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setInitStep(0)} className="flex-1 px-4 py-2 border rounded-lg text-sm">返回</button>
                  <button
                    onClick={async () => {
                      setMsg('初始化中...');
                      try {
                        await apiPost('/my-bets/init', { amount: initAmount });
                        setInitOpen(false); setInitStep(0); setMsg('');
                        fetchData();
                      } catch { setMsg('初始化失败'); }
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                  >
                    确认初始化
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
