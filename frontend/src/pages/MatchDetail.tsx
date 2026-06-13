// 单场比赛深度分析页
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '@/lib/utils';

interface MatchDetail {
  match_id: string; team_a: string; team_b: string;
  stage: string; group_name: string; kickoff_time: string; venue: string; city: string;
  status: string; score_a: number | null; score_b: number | null;
  prediction: {
    poisson_home_prob: number; poisson_draw_prob: number; poisson_away_prob: number;
    poisson_expected_goals_a: number; poisson_expected_goals_b: number;
    elo_home_prob: number; elo_draw_prob: number; elo_away_prob: number;
    final_home_prob: number; final_draw_prob: number; final_away_prob: number;
    top_scores: string;
    recommended_bet: string; value_edge: number | null;
  } | null;
  odds: Array<{
    source: string; home_odds: number; draw_odds: number; away_odds: number;
    home_implied_prob: number; draw_implied_prob: number; away_implied_prob: number; margin: number;
  }>;
}

export function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) return;
    apiGet<{ data: MatchDetail }>(`/matches/${matchId}`).then(r => {
      setMatch(r.data);
      setLoading(false);
    });
  }, [matchId]);

  const refreshPrediction = async () => {
    if (!matchId) return;
    const r = await apiPost<{ data: any }>(`/predictions/generate/${matchId}`, {});
    if (match) {
      setMatch({ ...match, prediction: r.data });
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;
  if (!match) return <div className="p-8 text-center text-gray-500">比赛不存在</div>;

  const p = match.prediction;
  let topScores: { score: string; prob: number }[] = [];
  try { topScores = p ? JSON.parse(p.top_scores) : []; } catch {}

  return (
    <div className="max-w-4xl">
      {/* 比赛头部 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border mb-6">
        <div className="text-center">
          <span className="text-sm text-gray-500">{match.match_id} · {match.venue}, {match.city}</span>
          <div className="flex items-center justify-center gap-8 mt-4">
            <div className="text-right">
              <p className="text-2xl font-bold">{match.team_a}</p>
              {match.score_a != null && <p className="text-4xl font-bold text-primary-600 mt-2">{match.score_a}</p>}
            </div>
            <div className="text-center">
              <span className="text-xl text-gray-400">vs</span>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(match.kickoff_time).toLocaleString('zh-CN', {
                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{match.team_b}</p>
              {match.score_b != null && <p className="text-4xl font-bold text-primary-600 mt-2">{match.score_b}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* 预测分析 */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* 模型概率 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">预测模型</h3>
            <button onClick={refreshPrediction} className="text-xs text-primary-600 hover:underline">
              刷新预测
            </button>
          </div>
          {p ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Poisson 模型</span>
                  <span className="text-xs text-gray-400">xG: {p.poisson_expected_goals_a} - {p.poisson_expected_goals_b}</span>
                </div>
                <div className="flex h-6 rounded overflow-hidden">
                  <div className="bg-blue-500 flex items-center justify-center text-xs text-white" style={{width: (p.poisson_home_prob*100)+'%'}}>{(p.poisson_home_prob*100).toFixed(0)}%</div>
                  <div className="bg-gray-300 flex items-center justify-center text-xs" style={{width: (p.poisson_draw_prob*100)+'%'}}>{(p.poisson_draw_prob*100).toFixed(0)}%</div>
                  <div className="bg-red-400 flex items-center justify-center text-xs text-white" style={{width: (p.poisson_away_prob*100)+'%'}}>{(p.poisson_away_prob*100).toFixed(0)}%</div>
                </div>
              </div>
              <div>
                <span className="text-sm text-gray-500">Elo 模型</span>
                <div className="flex h-6 rounded overflow-hidden mt-1">
                  <div className="bg-blue-400 flex items-center justify-center text-xs text-white" style={{width: (p.elo_home_prob*100)+'%'}}>{(p.elo_home_prob*100).toFixed(0)}%</div>
                  <div className="bg-gray-300 flex items-center justify-center text-xs" style={{width: (p.elo_draw_prob*100)+'%'}}>{(p.elo_draw_prob*100).toFixed(0)}%</div>
                  <div className="bg-red-300 flex items-center justify-center text-xs text-white" style={{width: (p.elo_away_prob*100)+'%'}}>{(p.elo_away_prob*100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <span className="text-sm font-semibold">综合预测</span>
                <div className="flex h-8 rounded overflow-hidden mt-1 text-sm font-bold">
                  <div className="bg-blue-600 flex items-center justify-center text-white" style={{width: (p.final_home_prob*100)+'%'}}>{(p.final_home_prob*100).toFixed(0)}%</div>
                  <div className="bg-gray-400 flex items-center justify-center text-white" style={{width: (p.final_draw_prob*100)+'%'}}>{(p.final_draw_prob*100).toFixed(0)}%</div>
                  <div className="bg-red-500 flex items-center justify-center text-white" style={{width: (p.final_away_prob*100)+'%'}}>{(p.final_away_prob*100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="text-sm pt-1">
                推荐: <span className={p.recommended_bet === 'skip' ? 'text-gray-500' : 'text-success font-semibold'}>
                  {p.recommended_bet === 'skip' ? '建议观望' :
                   p.recommended_bet === 'home' ? match.team_a + ' 胜' :
                   p.recommended_bet === 'draw' ? '平局' : match.team_b + ' 胜'}
                </span>
                {p.value_edge != null && <span className="ml-2 text-xs text-gray-400">(价值: {(p.value_edge*100).toFixed(1)}%)</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">尚未生成预测</p>
          )}
        </div>

        {/* 最可能比分 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <h3 className="font-semibold mb-3">最可能比分 TOP 5</h3>
          {topScores.length > 0 ? (
            <div className="space-y-2">
              {topScores.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-8">{s.score}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary-400 rounded"
                      style={{ width: (s.prob / topScores[0].prob * 100) + '%' }}
                    />
                  </div>
                  <span className="text-sm w-14 text-right">{(s.prob * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无数据</p>
          )}
        </div>
      </div>

      {/* 赔率对比 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h3 className="font-semibold mb-3">赔率对比</h3>
        {match.odds.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">来源</th>
                <th className="py-2 text-center">主胜</th>
                <th className="py-2 text-center">平</th>
                <th className="py-2 text-center">客胜</th>
                <th className="py-2 text-center">抽水</th>
              </tr>
            </thead>
            <tbody>
              {match.odds.map((o, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{o.source}</td>
                  <td className="py-2 text-center">{o.home_odds?.toFixed(2)}</td>
                  <td className="py-2 text-center">{o.draw_odds?.toFixed(2)}</td>
                  <td className="py-2 text-center">{o.away_odds?.toFixed(2)}</td>
                  <td className="py-2 text-center text-gray-400">{o.margin?.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">
            暂无赔率数据 — 前往 <a href="/odds" className="text-primary-600 underline">赔率管理</a> 添加
          </p>
        )}
      </div>
    </div>
  );
}
