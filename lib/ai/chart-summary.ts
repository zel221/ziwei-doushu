import { BRANCHES, STEMS } from '../ziwei/constants';
import { isRecord } from './util';

const PALACE_ORDER = [
  '命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫',
  '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫',
];

const SIHUA_ORDER = ['禄', '权', '科', '忌'];

const STAR_TYPE: Record<string, string> = {
  major: '主',
  minor: '辅',
  lucky: '吉',
  sha: '煞',
};

const TYPE_RANK: Record<string, number> = { major: 0, minor: 1, lucky: 2, sha: 3 };

const SUMMARY_LIMIT = 8000;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, max);
}

function stemBranch(stem: unknown, branch: unknown): string {
  const s = typeof stem === 'number' ? STEMS[stem] ?? '' : '';
  const b = typeof branch === 'number' ? BRANCHES[branch] ?? '' : '';
  return `${s}${b}`;
}

function formatStar(star: Record<string, unknown>): string {
  const name = text(star.name, 12);
  if (!name) return '';
  const bits: string[] = [];
  const type = text(star.type, 12);
  if (STAR_TYPE[type]) bits.push(STAR_TYPE[type]);
  const bright = text(star.brightnessRaw, 4) || text(star.brightness, 8);
  if (bright) bits.push(bright);
  const siHua = text(star.siHua, 2);
  if (siHua) bits.push(`化${siHua}`);
  return bits.length ? `${name}(${bits.join(',')})` : name;
}

function formatPalace(palace: Record<string, unknown>): string {
  const name = text(palace.name, 8) || '未知宫';
  const marks: string[] = [];
  if (palace.isMingGong === true) marks.push('命');
  if (palace.isShenGong === true) marks.push('身');
  if (palace.isCurrentDaXian === true) marks.push('当前大限');
  const ganZhi = stemBranch(palace.stem, palace.branch);
  const ages = Array.isArray(palace.daXianAge) ? palace.daXianAge : [];
  const ageText = typeof ages[0] === 'number' && typeof ages[1] === 'number'
    ? `大限${ages[0]}-${ages[1]}`
    : '';

  const stars = Array.isArray(palace.stars) ? palace.stars : [];
  const formatted = stars
    .filter(isRecord)
    .map(star => ({ star, label: formatStar(star) }))
    .filter(item => item.label)
    .sort((a, b) => (TYPE_RANK[text(a.star.type, 12)] ?? 9) - (TYPE_RANK[text(b.star.type, 12)] ?? 9))
    .slice(0, 24)
    .map(item => item.label);

  let body = formatted.join('、');
  if (palace.isEmpty === true) {
    const from = text(palace.borrowedFromName, 8);
    const borrowed = Array.isArray(palace.borrowedStars)
      ? palace.borrowedStars.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 8)
      : [];
    const empty = `空宫${from ? `借${from}` : ''}${borrowed.length ? `：${borrowed.join('、')}` : ''}`;
    body = body ? `${empty}；${body}` : empty;
  }
  if (!body) body = '无星曜';

  const head = [name, ganZhi, marks.length ? `[${marks.join(' ')}]` : '', ageText].filter(Boolean).join(' ');
  return `- ${head}：${body}`;
}

function natalSihua(palaces: Record<string, unknown>[]): string[] {
  const found: { order: number; line: string }[] = [];
  for (const palace of palaces) {
    const palaceName = text(palace.name, 8) || '未知宫';
    const stars = Array.isArray(palace.stars) ? palace.stars : [];
    for (const star of stars) {
      if (!isRecord(star)) continue;
      const siHua = text(star.siHua, 2);
      const name = text(star.name, 12);
      const order = SIHUA_ORDER.indexOf(siHua);
      if (!name || order < 0) continue;
      found.push({ order, line: `化${siHua} ${name}@${palaceName}` });
    }
  }
  found.sort((a, b) => a.order - b.order);
  return found.map(item => item.line);
}

function birthLine(chart: Record<string, unknown>): string {
  const birth = isRecord(chart.birthInfo) ? chart.birthInfo : undefined;
  const lunar = isRecord(chart.lunarInfo) ? chart.lunarInfo : undefined;
  const bits: string[] = [];
  const name = birth ? text(birth.name, 20) : '';
  if (name) bits.push(`姓名：${name}`);
  if (birth?.gender === 'male') bits.push('性别：男');
  else if (birth?.gender === 'female') bits.push('性别：女');
  const yinYang = text(chart.yinYangGender, 8);
  if (yinYang) bits.push(`阴阳：${yinYang}`);
  if (birth && typeof birth.year === 'number' && typeof birth.month === 'number' && typeof birth.day === 'number') {
    bits.push(`公历：${birth.year}-${birth.month}-${birth.day}`);
  }
  if (birth && typeof birth.hour === 'number' && BRANCHES[birth.hour]) {
    bits.push(`时辰：${BRANCHES[birth.hour]}时`);
  }
  const place = [birth ? text(birth.province, 12) : '', birth ? text(birth.city, 12) : ''].filter(Boolean).join('');
  if (place) bits.push(`出生地：${place}`);
  if (lunar && typeof lunar.lunarYear === 'number') {
    const month = typeof lunar.lunarMonth === 'number' ? Math.abs(lunar.lunarMonth) : undefined;
    const leap = lunar.isLeapMonth === true || (typeof lunar.lunarMonth === 'number' && lunar.lunarMonth < 0);
    const day = typeof lunar.lunarDay === 'number' ? `${lunar.lunarDay}日` : '';
    if (month) bits.push(`农历：${lunar.lunarYear}年${leap ? '闰' : ''}${month}月${day}`);
  }
  const ju = text(chart.wuxingJuName, 12);
  if (ju) bits.push(`五行局：${ju}`);
  const mingZhu = text(chart.mingZhu, 8);
  const shenZhu = text(chart.shenZhu, 8);
  if (mingZhu) bits.push(`命主：${mingZhu}`);
  if (shenZhu) bits.push(`身主：${shenZhu}`);
  if (typeof chart.currentAge === 'number') bits.push(`当前年龄：${chart.currentAge}`);
  return bits.join('；');
}

function pillarLine(lunar: Record<string, unknown> | undefined): string[] {
  if (!lunar) return [];
  const lines: string[] = [];
  const solar = Array.isArray(lunar.fourPillars) ? lunar.fourPillars.filter((item): item is string => typeof item === 'string').slice(0, 4) : [];
  const lunarPillars = Array.isArray(lunar.fourPillarsLunar)
    ? lunar.fourPillarsLunar.filter((item): item is string => typeof item === 'string').slice(0, 4)
    : [];
  if (solar.length) lines.push(`节气四柱：${solar.join(' ')}`);
  if (lunarPillars.length && lunarPillars.join(' ') !== solar.join(' ')) {
    lines.push(`农历四柱：${lunarPillars.join(' ')}`);
  }
  return lines;
}

function daXianLine(chart: Record<string, unknown>): string {
  if (!Array.isArray(chart.daXians)) return '';
  const index = typeof chart.currentDaXianIndex === 'number' ? chart.currentDaXianIndex : -1;
  const parts = chart.daXians.slice(0, 12).flatMap((item, i) => {
    if (!isRecord(item)) return [];
    if (typeof item.startAge !== 'number' || typeof item.endAge !== 'number') return [];
    const palace = text(item.palaceName, 8);
    const mark = i === index ? '当前 ' : '';
    return [`${mark}${item.startAge}-${item.endAge}${palace ? ` ${palace}` : ''}`.trim()];
  });
  return parts.length ? `大限：${parts.join('；')}` : '';
}

/**
 * 只摘宫位、星曜、生年四化和大限。
 * 不带 analysisCacheProfile、经纬度等排盘签名或无关字段。
 * 宫干自化、大限飞化不写入摘要：倪师《天纪》的讲法不靠这套。
 */
export function summarizeChart(chart: unknown): string {
  if (!isRecord(chart)) return '命盘数据不完整。';
  const palaces = Array.isArray(chart.palaces) ? chart.palaces.filter(isRecord).slice(0, 12) : [];
  const lines = ['【命盘摘要】'];
  const birth = birthLine(chart);
  if (birth) lines.push(birth);
  lines.push(...pillarLine(isRecord(chart.lunarInfo) ? chart.lunarInfo : undefined));

  const sihua = natalSihua(palaces);
  lines.push(sihua.length ? `生年四化：${sihua.join('；')}` : '生年四化：摘要中未标出');

  const daxian = daXianLine(chart);
  if (daxian) lines.push(daxian);

  if (!palaces.length) {
    lines.push('十二宫：缺失');
  } else {
    const ordered = [...palaces].sort((a, b) => {
      const ai = PALACE_ORDER.indexOf(text(a.name, 8));
      const bi = PALACE_ORDER.indexOf(text(b.name, 8));
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    lines.push('十二宫：');
    for (const palace of ordered) lines.push(formatPalace(palace));
  }

  let summary = lines.join('\n');
  if (summary.length > SUMMARY_LIMIT) {
    summary = `${summary.slice(0, SUMMARY_LIMIT)}\n（摘要已截断）`;
  }
  return summary;
}
