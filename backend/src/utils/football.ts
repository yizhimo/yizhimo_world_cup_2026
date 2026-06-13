// 足球领域工具函数

// 2026 世界杯 48 支参赛队伍 + 初始 Elo (来源: eloratings.net, 2026年1月)
export const WC2026_TEAMS: { name: string; name_en: string; fifa_code: string; confederation: string; elo: number }[] = [
  // Group A
  { name: '墨西哥', name_en: 'Mexico', fifa_code: 'MEX', confederation: 'CONCACAF', elo: 1820 },
  { name: '南非', name_en: 'South Africa', fifa_code: 'RSA', confederation: 'CAF', elo: 1520 },
  { name: '韩国', name_en: 'South Korea', fifa_code: 'KOR', confederation: 'AFC', elo: 1720 },
  { name: '捷克', name_en: 'Czechia', fifa_code: 'CZE', confederation: 'UEFA', elo: 1780 },
  // Group B
  { name: '加拿大', name_en: 'Canada', fifa_code: 'CAN', confederation: 'CONCACAF', elo: 1680 },
  { name: '波黑', name_en: 'Bosnia & Herzegovina', fifa_code: 'BIH', confederation: 'UEFA', elo: 1640 },
  { name: '卡塔尔', name_en: 'Qatar', fifa_code: 'QAT', confederation: 'AFC', elo: 1580 },
  { name: '瑞士', name_en: 'Switzerland', fifa_code: 'SUI', confederation: 'UEFA', elo: 1897 },
  // Group C
  { name: '巴西', name_en: 'Brazil', fifa_code: 'BRA', confederation: 'CONMEBOL', elo: 1979 },
  { name: '摩洛哥', name_en: 'Morocco', fifa_code: 'MAR', confederation: 'CAF', elo: 1790 },
  { name: '海地', name_en: 'Haiti', fifa_code: 'HAI', confederation: 'CONCACAF', elo: 1420 },
  { name: '苏格兰', name_en: 'Scotland', fifa_code: 'SCO', confederation: 'UEFA', elo: 1740 },
  // Group D
  { name: '美国', name_en: 'USA', fifa_code: 'USA', confederation: 'CONCACAF', elo: 1760 },
  { name: '巴拉圭', name_en: 'Paraguay', fifa_code: 'PAR', confederation: 'CONMEBOL', elo: 1680 },
  { name: '澳大利亚', name_en: 'Australia', fifa_code: 'AUS', confederation: 'AFC', elo: 1700 },
  { name: '土耳其', name_en: 'Türkiye', fifa_code: 'TUR', confederation: 'UEFA', elo: 1880 },
  // Group E
  { name: '德国', name_en: 'Germany', fifa_code: 'GER', confederation: 'UEFA', elo: 1910 },
  { name: '库拉索', name_en: 'Curaçao', fifa_code: 'CUW', confederation: 'CONCACAF', elo: 1350 },
  { name: '科特迪瓦', name_en: "Côte d'Ivoire", fifa_code: 'CIV', confederation: 'CAF', elo: 1660 },
  { name: '厄瓜多尔', name_en: 'Ecuador', fifa_code: 'ECU', confederation: 'CONMEBOL', elo: 1933 },
  // Group F
  { name: '荷兰', name_en: 'Netherlands', fifa_code: 'NED', confederation: 'UEFA', elo: 1959 },
  { name: '日本', name_en: 'Japan', fifa_code: 'JPN', confederation: 'AFC', elo: 1879 },
  { name: '瑞典', name_en: 'Sweden', fifa_code: 'SWE', confederation: 'UEFA', elo: 1750 },
  { name: '突尼斯', name_en: 'Tunisia', fifa_code: 'TUN', confederation: 'CAF', elo: 1680 },
  // Group G
  { name: '比利时', name_en: 'Belgium', fifa_code: 'BEL', confederation: 'UEFA', elo: 1849 },
  { name: '埃及', name_en: 'Egypt', fifa_code: 'EGY', confederation: 'CAF', elo: 1720 },
  { name: '伊朗', name_en: 'Iran', fifa_code: 'IRN', confederation: 'AFC', elo: 1710 },
  { name: '新西兰', name_en: 'New Zealand', fifa_code: 'NZL', confederation: 'OFC', elo: 1420 },
  // Group H
  { name: '西班牙', name_en: 'Spain', fifa_code: 'ESP', confederation: 'UEFA', elo: 2171 },
  { name: '佛得角', name_en: 'Cabo Verde', fifa_code: 'CPV', confederation: 'CAF', elo: 1510 },
  { name: '沙特阿拉伯', name_en: 'Saudi Arabia', fifa_code: 'KSA', confederation: 'AFC', elo: 1560 },
  { name: '乌拉圭', name_en: 'Uruguay', fifa_code: 'URU', confederation: 'CONMEBOL', elo: 1890 },
  // Group I
  { name: '法国', name_en: 'France', fifa_code: 'FRA', confederation: 'UEFA', elo: 2063 },
  { name: '塞内加尔', name_en: 'Senegal', fifa_code: 'SEN', confederation: 'CAF', elo: 1869 },
  { name: '伊拉克', name_en: 'Iraq', fifa_code: 'IRQ', confederation: 'AFC', elo: 1500 },
  { name: '挪威', name_en: 'Norway', fifa_code: 'NOR', confederation: 'UEFA', elo: 1922 },
  // Group J
  { name: '阿根廷', name_en: 'Argentina', fifa_code: 'ARG', confederation: 'CONMEBOL', elo: 2113 },
  { name: '阿尔及利亚', name_en: 'Algeria', fifa_code: 'ALG', confederation: 'CAF', elo: 1690 },
  { name: '奥地利', name_en: 'Austria', fifa_code: 'AUT', confederation: 'UEFA', elo: 1830 },
  { name: '约旦', name_en: 'Jordan', fifa_code: 'JOR', confederation: 'AFC', elo: 1480 },
  // Group K
  { name: '葡萄牙', name_en: 'Portugal', fifa_code: 'POR', confederation: 'UEFA', elo: 1976 },
  { name: '刚果民主共和国', name_en: 'DR Congo', fifa_code: 'COD', confederation: 'CAF', elo: 1580 },
  { name: '乌兹别克斯坦', name_en: 'Uzbekistan', fifa_code: 'UZB', confederation: 'AFC', elo: 1530 },
  { name: '哥伦比亚', name_en: 'Colombia', fifa_code: 'COL', confederation: 'CONMEBOL', elo: 1998 },
  // Group L
  { name: '英格兰', name_en: 'England', fifa_code: 'ENG', confederation: 'UEFA', elo: 2042 },
  { name: '克罗地亚', name_en: 'Croatia', fifa_code: 'CRO', confederation: 'UEFA', elo: 1933 },
  { name: '加纳', name_en: 'Ghana', fifa_code: 'GHA', confederation: 'CAF', elo: 1650 },
  { name: '巴拿马', name_en: 'Panama', fifa_code: 'PAN', confederation: 'CONCACAF', elo: 1490 },
];

// 获取球队信息
export function getTeam(name: string) {
  return WC2026_TEAMS.find(
    t => t.name === name || t.name_en === name || t.fifa_code === name
  );
}

// 2026 世界杯小组赛赛程 (前几场)
export const GROUP_STAGE_SCHEDULE = [
  // June 11
  { matchId: 'A1', stage: 'group', group: 'A', matchday: 1, teamA: '墨西哥', teamB: '南非', kickoff: '2026-06-11T15:00:00-06:00', venue: 'Estadio Azteca', city: 'Mexico City' },
  { matchId: 'A2', stage: 'group', group: 'A', matchday: 1, teamA: '韩国', teamB: '捷克', kickoff: '2026-06-11T22:00:00-06:00', venue: 'Estadio Akron', city: 'Guadalajara' },
  // June 12
  { matchId: 'B1', stage: 'group', group: 'B', matchday: 1, teamA: '加拿大', teamB: '波黑', kickoff: '2026-06-12T15:00:00-05:00', venue: 'BMO Field', city: 'Toronto' },
  { matchId: 'D1', stage: 'group', group: 'D', matchday: 1, teamA: '美国', teamB: '巴拉圭', kickoff: '2026-06-12T21:00:00-08:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  // June 13
  { matchId: 'B2', stage: 'group', group: 'B', matchday: 1, teamA: '卡塔尔', teamB: '瑞士', kickoff: '2026-06-13T17:00:00-08:00', venue: "Levi's Stadium", city: 'San Francisco' },
  { matchId: 'C1', stage: 'group', group: 'C', matchday: 1, teamA: '巴西', teamB: '摩洛哥', kickoff: '2026-06-13T21:00:00-05:00', venue: 'MetLife Stadium', city: 'New York/New Jersey' },
  { matchId: 'C2', stage: 'group', group: 'C', matchday: 1, teamA: '海地', teamB: '苏格兰', kickoff: '2026-06-13T20:00:00-05:00', venue: 'Gillette Stadium', city: 'Boston' },
  { matchId: 'D2', stage: 'group', group: 'D', matchday: 1, teamA: '澳大利亚', teamB: '土耳其', kickoff: '2026-06-13T18:00:00-08:00', venue: 'BC Place', city: 'Vancouver' },
];
