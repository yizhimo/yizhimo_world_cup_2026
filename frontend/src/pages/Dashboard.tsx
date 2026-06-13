// 主页仪表盘
import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle, Target, RefreshCw } from 'lucide-react';

interface StatsData {
  currentBankroll: number;
  profit: number;
  roi: number;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  risk: { status: string; lossStreak: number; recommendations: string[] };
}

interface UpcomingMatch {
  match_id: string; team_a: string; team_b: string; kickoff_time: string;
  prediction: { final_home_prob: number; final_draw_prob: number; final_away_prob: number; recommended_bet: string } | null;
}

interface BettingAdviceItem {
  matchId: string; teamA: string; teamB: string;
  recommendation: {
    action: 'bet' | 'skip' | 'wait';
    outcome: string;
    bestOdds: number;
    bestSource: string;
    stake: number;
    reason: string;
  };
  final: { home: number; draw: number; away: number };
  riskWarnings: string[];
}

export function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [advice, setAdvice] = useState<BettingAdviceItem[]>([]);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  const fetchData = useCallback(() => {
    apiGet<{ data: StatsData }>('/stats/overview').then(r => setStats(r.data));
    apiGet<{ data: UpcomingMatch[] }>('/matches?status=upcoming&limit=6').then(r => setUpcoming(r.data.slice(0, 6)));
    apiGet<{ data: BettingAdviceItem[] }>('/odds/advice').then(r => {
      if (Array.isArray(r.data)) setAdvice(r.data.filter(a => a.recommendation.action === 'bet'));
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleManualUpdate = async () => {
    setUpdating(true);
    setUpdateMsg('正在拉取赔率、生成预测和投注建议...');
    try {
      const r = await apiPost<{ data: { oddsUpdated: number; predictionsGenerated: number; adviceCount: number; error?: string } }>('/odds/full-update', {});
      const d = r.data;
      if (d.error) {
        setUpdateMsg(`更新失败: ${d.error}`);
      } else {
        setUpdateMsg(`更新完成! 赔率 ${d.oddsUpdated} 条, 预测 ${d.predictionsGenerated} 场, 价值投注 ${d.adviceCount} 场`);
        setTimeout(() => fetchData(), 500);
      }
    } catch {
      setUpdateMsg('更新失败，请检查 API Key 配置或网络连接');
    }
    setUpdating(false);
    setTimeout(() => setUpdateMsg(''), 8000);
  };

  const daysToKickoff = Math.max(0, Math.ceil((new Date('2026-06-11').getTime() - Date.now()) / 86400000));

  const riskColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-success';
      case 'caution': return 'text-warning';
      case 'danger': return 'text-danger';
      case 'stop': return 'text-danger';
      default: return '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">仪表盘</h2>
        <div className="flex items-center gap-3">
          {updateMsg && (
            <span className={`text-xs ${updateMsg.includes('失败') ? 'text-danger' : 'text-success'}`}>
              {updateMsg}
            </span>
          )}
          <button
            onClick={handleManualUpdate}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
            {updating ? '更新中...' : '手动更新'}
          </button>
        </div>
      </div>

      {/* 资金概览 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">当前余额</p>
          <p className="text-3xl font-bold text-primary-600 mt-1">
            ¥{stats?.currentBankroll?.toFixed(0) ?? '—'}
          </p>
          <p className={`text-sm mt-1 ${(stats?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
            {stats ? (stats.profit >= 0 ? '+' : '') + '¥' + stats.profit.toFixed(0) : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">总投注 / 命中率</p>
          <p className="text-3xl font-bold mt-1">{stats?.totalBets ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">
            {stats ? (stats.winRate * 100).toFixed(0) + '%' : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">ROI</p>
          <p className={`text-3xl font-bold mt-1 ${(stats?.roi ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
            {stats ? (stats.roi >= 0 ? '+' : '') + stats.roi.toFixed(1) + '%' : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <p className="text-sm text-gray-500">风险状态</p>
          <p className={`text-xl font-bold mt-1 ${riskColor(stats?.risk?.status ?? 'normal')}`}>
            {stats?.risk?.status === 'normal' ? '正常' :
             stats?.risk?.status === 'caution' ? '注意' :
             stats?.risk?.status === 'danger' ? '危险' : '暂停'}
          </p>
          <p className="text-sm text-gray-500">连亏: {stats?.risk?.lossStreak ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 距离开赛 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold">距离开赛</h3>
          </div>
          <p className="text-4xl font-bold text-primary-600">{daysToKickoff} 天</p>
          <p className="text-sm text-gray-500 mt-1">2026年6月11日 墨西哥 vs 南非</p>
        </div>

        {/* 策略状态 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            {stats?.risk?.status === 'normal' ? (
              <CheckCircle className="w-5 h-5 text-success" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-warning" />
            )}
            <h3 className="font-semibold">策略状态</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">命中率</span>
              <span className="font-medium">{stats ? (stats.winRate * 100).toFixed(0) + '%' : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">盈亏</span>
              <span className={`font-medium ${(stats?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {stats ? (stats.profit >= 0 ? '+' : '') + '¥' + stats.profit.toFixed(2) : ''}
              </span>
            </div>
          </div>
          {stats?.risk?.recommendations?.map((r, i) => (
            <p key={i} className="text-xs text-warning mt-2">{r}</p>
          ))}
        </div>
      </div>

      {/* 投注建议 */}
      {advice.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-success" />
            <h3 className="font-semibold">价值投注建议</h3>
            <span className="text-xs text-gray-400">(模型概率 vs 市场赔率)</span>
          </div>
          <div className="space-y-3">
            {advice.slice(0, 3).map(a => {
              const outcomeLabel = a.recommendation.outcome === 'home' ? a.teamA + '胜'
                : a.recommendation.outcome === 'away' ? a.teamB + '胜'
                : '平局';
              return (
                <div key={a.matchId} className="bg-white rounded-lg p-4 shadow-sm border border-success/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{a.teamA} vs {a.teamB}</span>
                        <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded">
                          推荐: {outcomeLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        模型概率: {(a.final.home * 100).toFixed(1)}% / {(a.final.draw * 100).toFixed(1)}% / {(a.final.away * 100).toFixed(1)}%
                        {' · '}最佳赔率: {a.recommendation.bestOdds.toFixed(2)} ({a.recommendation.bestSource})
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-success">¥{a.recommendation.stake.toFixed(0)}</p>
                      <p className="text-xs text-gray-400">建议投注</p>
                    </div>
                  </div>
                  {a.riskWarnings.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {a.riskWarnings.map((w, i) => (
                        <span key={i} className="text-xs text-warning bg-warning/5 px-2 py-0.5 rounded">{w}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 近期比赛 */}
      {upcoming.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-3">近期比赛</h3>
          <div className="grid grid-cols-3 gap-3">
            {upcoming.map(m => (
              <div key={m.match_id} className="bg-white rounded-lg p-4 shadow-sm border">
                <div className="text-xs text-gray-400 mb-1">{m.match_id} · {new Date(m.kickoff_time).toLocaleDateString('zh-CN')}</div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">{m.team_a}</span>
                  <span className="text-xs text-gray-400">vs</span>
                  <span className="font-medium">{m.team_b}</span>
                </div>
                {m.prediction && (
                  <div className="mt-2 text-xs text-gray-500">
                    预测: {m.prediction.recommended_bet === 'home' ? m.team_a + '胜' : m.prediction.recommended_bet === 'away' ? m.team_b + '胜' : m.prediction.recommended_bet === 'draw' ? '平局' : '建议跳过'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
