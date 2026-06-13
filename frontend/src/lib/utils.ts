import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// API 基础请求
const API_BASE = '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// 球队英文名 → 🇫🇷 中文名
const TEAM_FLAG: Record<string, string> = {
  'Mexico': '🇲🇽 墨西哥', 'South Africa': '🇿🇦 南非', 'South Korea': '🇰🇷 韩国', 'Czech Republic': '🇨🇿 捷克',
  'Canada': '🇨🇦 加拿大', 'Bosnia and Herzegovina': '🇧🇦 波黑', 'Qatar': '🇶🇦 卡塔尔', 'Switzerland': '🇨🇭 瑞士',
  'Brazil': '🇧🇷 巴西', 'Morocco': '🇲🇦 摩洛哥', 'Haiti': '🇭🇹 海地', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿 苏格兰',
  'United States': '🇺🇸 美国', 'Paraguay': '🇵🇾 巴拉圭', 'Australia': '🇦🇺 澳大利亚', 'Turkey': '🇹🇷 土耳其',
  'Germany': '🇩🇪 德国', 'Curacao': '🇨🇼 库拉索', 'Ivory Coast': '🇨🇮 科特迪瓦', 'Ecuador': '🇪🇨 厄瓜多尔',
  'Netherlands': '🇳🇱 荷兰', 'Japan': '🇯🇵 日本', 'Sweden': '🇸🇪 瑞典', 'Tunisia': '🇹🇳 突尼斯',
  'Belgium': '🇧🇪 比利时', 'Egypt': '🇪🇬 埃及', 'Iran': '🇮🇷 伊朗', 'New Zealand': '🇳🇿 新西兰',
  'Spain': '🇪🇸 西班牙', 'Cape Verde': '🇨🇻 佛得角', 'Saudi Arabia': '🇸🇦 沙特阿拉伯', 'Uruguay': '🇺🇾 乌拉圭',
  'France': '🇫🇷 法国', 'Senegal': '🇸🇳 塞内加尔', 'Iraq': '🇮🇶 伊拉克', 'Norway': '🇳🇴 挪威',
  'Argentina': '🇦🇷 阿根廷', 'Algeria': '🇩🇿 阿尔及利亚', 'Austria': '🇦🇹 奥地利', 'Jordan': '🇯🇴 约旦',
  'Portugal': '🇵🇹 葡萄牙', 'DR Congo': '🇨🇩 刚果(金)', 'Uzbekistan': '🇺🇿 乌兹别克斯坦', 'Colombia': '🇨🇴 哥伦比亚',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿 英格兰', 'Croatia': '🇭🇷 克罗地亚', 'Ghana': '🇬🇭 加纳', 'Panama': '🇵🇦 巴拿马',
};

export function teamDisplay(name: string): string {
  return TEAM_FLAG[name] || name;
}
