// 格式化工具

// 概率 → 百分比字符串
export function pct(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + '%';
}

// 数字 → 中文结果
export function resultLabel(result: string): string {
  switch (result) {
    case 'win': return '赢';
    case 'loss': return '输';
    case 'push': return '走水';
    case 'pending': return '待结算';
    default: return result;
  }
}

// 结果颜色
export function resultColor(result: string): string {
  switch (result) {
    case 'win': return 'text-green-600';
    case 'loss': return 'text-red-600';
    case 'push': return 'text-yellow-600';
    case 'pending': return 'text-gray-400';
    default: return '';
  }
}

// 金额格式化
export function money(value: number): string {
  return '¥' + value.toFixed(2);
}

// 日期格式化
export function dateStr(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

// 投注玩法标签
export function betTypeLabel(type: string): string {
  return type === '1X2' ? '胜平负' : type === 'correct_score' ? '比分' : type;
}
