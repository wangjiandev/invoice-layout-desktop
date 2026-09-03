import { describe, expect, it } from 'vitest';
import {
  analyzeInvoiceText,
  normalizeExtractedText,
  parseChineseUpperMoney,
} from './invoice-analysis';

describe('invoice text analysis', () => {
  it('normalizes full-width characters and whitespace', () => {
    expect(normalizeExtractedText('票价：￥４１６．００  \n  济南')).toBe('票价:¥416.00\n济南');
  });

  it('parses uppercase Chinese money', () => {
    expect(parseChineseUpperMoney('贰佰玖拾玖圆整')).toBe('299.00');
    expect(parseChineseUpperMoney('贰佰柒拾伍圆伍角贰分')).toBe('275.52');
  });

  it('extracts and verifies a VAT invoice total', () => {
    const result = analyzeInvoiceText({
      text: '*生产生活服务*会员订阅\n价税合计（大写）贰佰玖拾玖圆整（小写）¥299.00',
      categoryHint: null,
    });
    expect(result).toMatchObject({
      category: 'ai_subscription',
      amount: '299.00',
      status: 'ready',
      reviewState: 'auto_confirmed',
    });
  });

  it('accepts fragmented digits after the VAT small-amount label', () => {
    const result = analyzeInvoiceText({
      text: '住宿服务\n价税合计（大写）壹佰陆拾玖圆整（小写）¥ 1 6 9 . 0 0',
      categoryHint: 'lodging',
    });
    expect(result).toMatchObject({ amount: '169.00', status: 'ready' });
  });

  it('uses the final decimal total for path-confirmed taxi statements without readable labels', () => {
    const result = analyzeInvoiceText({
      text: '99.32 2.98 99.32 2.98 102.30',
      categoryHint: 'taxi',
    });
    expect(result).toMatchObject({ amount: '102.30', amountSource: 'path_hint' });
  });

  it('extracts rail fares and uses eight-up layout', () => {
    const result = analyzeInvoiceText({
      text: '电子发票（铁路电子客票）\n票价：￥１５６．００',
      categoryHint: null,
    });
    expect(result).toMatchObject({ category: 'rail', amount: '156.00', layoutMode: 'rail_8up' });
  });

  it('extracts the final CNY amount from a flight total row', () => {
    const result = analyzeInvoiceText({
      text: '电子发票（航空运输电子客票行程单）\n票价 燃油附加费 合计\nCNY 891.74 CNY 64.22 CNY 86.04 CNY 50.00 CNY 0.00 CNY 1092.00\n电子客票号码',
      categoryHint: null,
    });
    expect(result).toMatchObject({ category: 'flight', amount: '1092.00' });
  });

  it('requires review when no text layer exists', () => {
    const result = analyzeInvoiceText({ text: '', categoryHint: 'lodging' });
    expect(result.reviewState).toBe('review_required');
    expect(result.issues[0].code).toBe('NO_TEXT_LAYER');
  });
});
