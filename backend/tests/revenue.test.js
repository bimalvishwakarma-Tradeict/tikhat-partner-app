/**
 * Revenue calculation tests (ROI daily/monthly/pro-rated behaviour).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyAmount,
  calculateDailyAverage,
  getDailyRange,
  calculateProRatedAmount,
  calculateDailyAmounts,
  calculateSegmentedMonthTotal,
} from '../src/services/roi.service.js';

describe('Revenue calculations', () => {
  it('ROI calculation: monthly amount from capital × ROI%', () => {
    assert.equal(calculateMonthlyAmount(250000, 12), 30000);
    assert.equal(calculateMonthlyAmount(100000, 15), 15000);
  });

  it('daily amounts stay within 90–110% of daily average (except last day)', () => {
    const capital = 100000;
    const roi = 18;
    const days = 30;
    const monthly = calculateMonthlyAmount(capital, roi, days);
    const avg = calculateDailyAverage(capital, roi, days);
    const { min, max } = getDailyRange(avg);

    const amounts = calculateDailyAmounts(monthly, days);
    for (let i = 0; i < amounts.length - 1; i += 1) {
      assert.ok(
        amounts[i] >= min && amounts[i] <= max,
        `day ${i + 1}: ${amounts[i]} not in [${min}, ${max}]`
      );
    }
  });

  it('monthly total equals sum of generated daily credits', () => {
    const monthly = calculateMonthlyAmount(75000, 20, 31);
    const amounts = calculateDailyAmounts(monthly, 31);
    assert.equal(
      amounts.reduce((a, b) => a + b, 0),
      monthly
    );
  });

  it('pro-rated first month uses remaining inclusive days', () => {
    // Join on day 20 of 31-day month
    const capital = 50000;
    const roi = 24;
    const days = 31;
    const startDay = 20;
    const expected = Math.round(
      (calculateMonthlyAmount(capital, roi, days) / days) *
        (days - startDay + 1)
    );
    assert.equal(
      calculateProRatedAmount(capital, roi, startDay, days),
      expected
    );
  });

  it('paused days are not redistributed (remaining schedule still targets month total only for active days)', () => {
    // If 2 days were paused (lost), regenerating for 28 remaining days still
    // sums to full monthly — pause loss is applied by skipping credit days,
    // not by shrinking the monthly target in calculateDailyAmounts.
    const monthly = 3000;
    const amounts = calculateDailyAmounts(monthly, 30, 0, 28);
    assert.equal(amounts.reduce((a, b) => a + b, 0), monthly);
  });

  it('mid-month capital increase uses new balance from next segment', () => {
    const days = 30;
    const before = calculateSegmentedMonthTotal(
      [{ capital: 10000, roiPercent: 30, startDay: 1, endDay: 30 }],
      days
    );
    const afterAdd = calculateSegmentedMonthTotal(
      [
        { capital: 10000, roiPercent: 30, startDay: 1, endDay: 15 },
        { capital: 20000, roiPercent: 30, startDay: 16, endDay: 30 },
      ],
      days
    );
    assert.ok(afterAdd > before);
  });

  it('all money amounts are whole integers (no floats)', () => {
    const values = [
      calculateMonthlyAmount(9999, 17),
      calculateDailyAverage(9999, 17, 30),
      ...Object.values(getDailyRange(97)),
      calculateProRatedAmount(9999, 17, 10, 30),
      ...calculateDailyAmounts(1700, 30),
    ];
    for (const v of values) {
      assert.equal(Number.isInteger(v), true);
    }
  });
});
