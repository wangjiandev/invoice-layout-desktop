import Decimal from 'decimal.js';
import {
  categoryLabels,
  invoiceCategories,
  type InvoiceItem,
  type InvoiceStatistics,
} from './types';

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parseMoney(value: string | null): Decimal | null {
  if (value === null || !MONEY_PATTERN.test(value.trim())) return null;

  try {
    const amount = new Decimal(value);
    return amount.isNegative() ? null : amount;
  } catch {
    return null;
  }
}

export function normalizeMoney(value: string): string | null {
  const amount = parseMoney(value.trim());
  return amount?.toDecimalPlaces(2).toFixed(2) ?? null;
}

export function calculateStatistics(items: InvoiceItem[]): InvoiceStatistics {
  const byCategory = invoiceCategories.map((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    const amount = categoryItems.reduce((sum, item) => {
      const parsed = parseMoney(item.amount);
      return parsed ? sum.plus(parsed) : sum;
    }, new Decimal(0));

    return {
      category,
      count: categoryItems.length,
      amount: amount.toFixed(2),
      label: categoryLabels[category],
    };
  });

  const totalAmount = byCategory.reduce(
    (sum, statistic) => sum.plus(statistic.amount),
    new Decimal(0),
  );

  return {
    totalCount: items.length,
    valuedCount: items.filter((item) => parseMoney(item.amount) !== null).length,
    totalAmount: totalAmount.toFixed(2),
    byCategory: byCategory.map(({ label: _label, ...statistic }) => statistic),
  };
}
