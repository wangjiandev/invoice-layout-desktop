import Decimal from 'decimal.js';
import { normalizeMoney } from './finance';
import type {
  AnalysisIssue,
  FieldSource,
  InvoiceCategory,
  InvoiceStatus,
  LayoutMode,
  ReviewState,
} from './types';

export interface TextAnalysisInput {
  text: string;
  categoryHint: InvoiceCategory | null;
}

export interface TextAnalysisOutput {
  category: InvoiceCategory;
  amount: string | null;
  layoutMode: LayoutMode;
  status: InvoiceStatus;
  reviewState: ReviewState;
  confidence: number;
  issues: AnalysisIssue[];
  categorySource: FieldSource;
  amountSource: FieldSource;
}

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  壹: 1,
  一: 1,
  贰: 2,
  两: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
  柒: 7,
  捌: 8,
  玖: 9,
};

export function normalizeExtractedText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseChineseInteger(value: string): number | null {
  if (!value) return 0;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of value) {
    if (character in CHINESE_DIGITS) {
      digit = CHINESE_DIGITS[character];
      continue;
    }
    const smallUnit = { 拾: 10, 佰: 100, 仟: 1000 }[character];
    if (smallUnit) {
      section += (digit || 1) * smallUnit;
      digit = 0;
      continue;
    }
    const largeUnit = { 万: 10_000, 亿: 100_000_000 }[character];
    if (largeUnit) {
      section += digit;
      total = (total + section) * largeUnit;
      section = 0;
      digit = 0;
      continue;
    }
    if (!/[整正]/.test(character)) return null;
  }
  return total + section + digit;
}

export function parseChineseUpperMoney(value: string): string | null {
  const normalized = value.normalize('NFKC').replace(/圆/g, '元').replace(/\s/g, '');
  const [integerPart = '', decimalPart = ''] = normalized.split('元');
  const integer = parseChineseInteger(integerPart);
  if (integer === null) return null;
  const jiaoMatch = decimalPart.match(/([零〇壹一贰两叁肆伍陆柒捌玖])角/);
  const fenMatch = decimalPart.match(/([零〇壹一贰两叁肆伍陆柒捌玖])分/);
  const jiao = jiaoMatch ? CHINESE_DIGITS[jiaoMatch[1]] : 0;
  const fen = fenMatch ? CHINESE_DIGITS[fenMatch[1]] : 0;
  return new Decimal(integer)
    .plus(new Decimal(jiao).div(10))
    .plus(new Decimal(fen).div(100))
    .toFixed(2);
}

function firstMoneyMatch(text: string, pattern: RegExp): string | null {
  const raw = text.match(pattern)?.[1]?.replace(/[,\s]/g, '');
  if (!raw) return null;
  return normalizeMoney(raw.replace(/\.$/, ''));
}

function extractVatAmount(text: string): { amount: string | null; mismatch: boolean } {
  const amount = firstMoneyMatch(
    text,
    /价税合计[\s\S]{0,180}?(?:小写)[）)\s:：]*[¥￥]?\s*(\d(?:[\s,]*\d)*(?:\s*\.\s*\d(?:\s*\d)?)?)/,
  );
  const upperText = text.match(/价税合计[^\n]{0,30}大写[）)]?\s*([^（(\n]{2,40})/)?.[1];
  const upperAmount = upperText ? parseChineseUpperMoney(upperText) : null;
  return { amount, mismatch: Boolean(amount && upperAmount && amount !== upperAmount) };
}

function extractFlightAmount(text: string): string | null {
  const ticketSection = text.split(/电子客票号码|保险费/)[0];
  const amounts = [...ticketSection.matchAll(/CNY\s*(\d[\d,]*(?:\.\d{1,2})?)/gi)];
  if (amounts.length === 0) return null;
  return normalizeMoney(amounts.at(-1)![1].replace(/,/g, ''));
}

function extractLastDecimalAmount(text: string): string | null {
  const amounts = [...text.matchAll(/(?:^|[^\d])(\d{1,6}\.\d{1,2})(?!\d)/g)];
  return amounts.length > 0 ? normalizeMoney(amounts.at(-1)![1]) : null;
}

function detectCategory(
  text: string,
  hint: InvoiceCategory | null,
): { category: InvoiceCategory; source: FieldSource; strong: boolean } {
  if (/铁路电子客票|退票费\s*[:：]|票价\s*[:：]/.test(text)) {
    return { category: 'rail', source: 'automatic', strong: true };
  }
  if (/航空运输电子客票行程单/.test(text)) {
    return { category: 'flight', source: 'automatic', strong: true };
  }
  if (/住宿服务|住宿费|酒店服务|宾馆/.test(text)) {
    return { category: 'lodging', source: 'automatic', strong: true };
  }
  if (/滴滴|网约车|客运服务|旅客运输服务/.test(text)) {
    return { category: 'taxi', source: 'automatic', strong: true };
  }
  if (/会员订阅|软件服务|人工智能|信息技术服务|AI\s*订阅/i.test(text)) {
    return { category: 'ai_subscription', source: 'automatic', strong: true };
  }
  if (hint) return { category: hint, source: 'path_hint', strong: false };
  return { category: 'unclassified', source: 'missing', strong: false };
}

export function analyzeInvoiceText({ text, categoryHint }: TextAnalysisInput): TextAnalysisOutput {
  const normalized = normalizeExtractedText(text);
  const issues: AnalysisIssue[] = [];
  if (!normalized) {
    return {
      category: categoryHint ?? 'unclassified',
      amount: null,
      layoutMode: categoryHint === 'rail' ? 'rail_8up' : 'standard_2up',
      status: 'review_required',
      reviewState: 'review_required',
      confidence: 0,
      issues: [{ code: 'NO_TEXT_LAYER', message: '未检测到文本层，请手工填写并确认' }],
      categorySource: categoryHint ? 'path_hint' : 'missing',
      amountSource: 'missing',
    };
  }

  const detected = detectCategory(normalized, categoryHint);
  let amount: string | null = null;
  let amountSource: FieldSource = 'automatic';
  let mismatch = false;
  if (detected.category === 'rail') {
    amount = firstMoneyMatch(
      normalized,
      /(?:票价|退票费)\s*[:：]?\s*[¥￥]?\s*(\d[\d,]*(?:\.\d{1,2})?)/,
    );
  } else if (detected.category === 'flight') {
    amount = extractFlightAmount(normalized);
  } else {
    const vat = extractVatAmount(normalized);
    amount = vat.amount;
    mismatch = vat.mismatch;
    if (!amount && detected.category === 'taxi' && categoryHint === 'taxi') {
      amount = extractLastDecimalAmount(normalized);
      amountSource = amount ? 'path_hint' : 'missing';
    }
  }

  if (!amount) issues.push({ code: 'AMOUNT_NOT_FOUND', message: '未找到明确的报销金额' });
  if (mismatch) issues.push({ code: 'AMOUNT_MISMATCH', message: '价税合计的大写和小写金额不一致' });
  if (detected.category === 'unclassified') {
    issues.push({ code: 'CATEGORY_UNCERTAIN', message: '无法可靠判断票据分类' });
  }

  const canAutoConfirm = Boolean(amount) && detected.category !== 'unclassified' && !mismatch;
  const confidence = canAutoConfirm ? (detected.strong ? 0.98 : 0.86) : amount ? 0.55 : 0.25;
  return {
    category: detected.category,
    amount,
    layoutMode: detected.category === 'rail' ? 'rail_8up' : 'standard_2up',
    status: canAutoConfirm ? 'ready' : 'review_required',
    reviewState: canAutoConfirm ? 'auto_confirmed' : 'review_required',
    confidence,
    issues,
    categorySource: detected.source,
    amountSource: amount ? amountSource : 'missing',
  };
}
