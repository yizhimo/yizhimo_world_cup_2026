// 比赛列表页
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/utils';

interface Match {
  match_id: string; team_a: string; team_b: string;
  stage: string; group_name: string; kickoff_time: string; venue: string; city: string;
  status: string; score_a: number | null; score_b: number | null;
  prediction: {
    final_home_prob: number; final_draw_prob: number; final_away_prob: number;
    recommended_bet: string; value_edge: number | null;
    poisson_expected_goals_a: number; poisson_expected_goals_b: number;
  } | null;
}

const STAGE_LABELS: Record<string, string> = {
  group: '小组赛', round32: '32强', round16: '16强',
  quarter: '1/4决赛', semi: '半决赛', third: '季军赛', final: '决赛',
};

export function Matches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ data: Match[] }>('/matches').then(r => {
      setMatches(r.data);
      setLoading(false);
    });
  }, []);

  const stages = ['all', ...new Set(matches.map(m => m.stage))];
  const filtered = filter === 'all' ? matches : matches.filter(m => m.stage === filter);

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  // 按日期分组
  const grouped: Record<string, Match[]> = {};
  for (const m of filtered) {
    const date = new Date(m.kickoff_time).toLocaleDateString('zh-CN', {
      month: '2-digit', day: '2-digit', weekday: 'short',
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(m);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">比赛列表 ({filtered.length})</h2>
        <div className="flex gap-2">
          {stages.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === s ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? '全部' : STAGE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {Object.entries(grouped).map(([date, dayMatches]) => (
        <div key={date} className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase">{date}</h3>
          <div className="space-y-2">
            {dayMatches.map(m => (
              <Link
                key={m.match_id}
                to={`/matches/${m.match_id}`}
                className="block bg-white rounded-lg p-4 shadow-sm border hover:border-primary-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* 比赛信息 */}
                  <div className="w-20 text-center">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {m.match_id}
                    </span>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(m.kickoff_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* 球队 */}
                  <div className="flex-1 flex items-center justify-center gap-6">
                    <span className="text-lg font-semibold w-32 text-right">{m.team_a}</span>
                    {m.status === 'finished' ? (
                      <span className="text-xl font-bold px-3 py-1 bg-gray-100 rounded">
                        {m.score_a} - {m.score_b}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">vs</span>
                    )}
                    <span className="text-lg font-semibold w-32">{m.team_b}</span>
                  </div>

                  {/* 预测 */}
                  {m.prediction && m.status === 'upcoming' && (
                    <div className="w-48 text-center">
                      <div className="flex gap-1 justify-center text-xs">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          主 {(m.prediction.final_home_prob * 100).toFixed(0)}%
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          平 {(m.prediction.final_draw_prob * 100).toFixed(0)}%
                        </span>
                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-700">
                          客 {(m.prediction.final_away_prob * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs mt-1">
                        <span className={m.prediction.recommended_bet === 'skip' ? 'text-gray-400' : 'text-success font-medium'}>
                          {m.prediction.recommended_bet === 'skip' ? '建议观望' :
                           m.prediction.recommended_bet === 'home' ? '推荐主胜' :
                           m.prediction.recommended_bet === 'draw' ? '推荐平局' : '推荐客胜'}
                        </span>
                      </div>
                    </div>
                  )}

                  {m.status === 'finished' && (
                    <div className="w-48 text-center">
                      <span className="text-sm text-gray-500">已结束</span>
                    </div>
                  )}

                  {/* 场地 */}
                  <div className="w-32 text-xs text-gray-400 text-right">
                    <div>{m.venue}</div>
                    <div>{m.city}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
