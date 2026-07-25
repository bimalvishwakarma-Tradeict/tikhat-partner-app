/**
 * ROI unit tests — PROJECT_KNOWLEDGE.md Section 7.2
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDaysInMonth,
  calculateMonthlyAmount,
  calculateDailyAverage,
  getDailyRange,
  calculateProRatedAmount,
  calculateDailyAmounts,
  calculateSegmentedMonthTotal,
  isLastDayOfMonth,
} from '../src/services/roi.service.js';

describe('ROI formulas (Section 7.2)', () => {
  describe('Knowledge base example: Capital ₹10,000 | ROI 30% | 30-day month', () => {
    const capital = 10000;
    const roi = 30;
    const days = 30;

    it('monthly total = ₹3,000', () => {
      assert.equal(calculateMonthlyAmount(capital, roi, days), 3000);
    });

    it('daily average = ₹100', () => {
      assert.equal(calculateDailyAverage(capital, roi, days), 100);
    });

    it('daily range = ₹90 to ₹110 (90%–110%)', () => {
      const range = getDailyRange(100);
      assert.equal(range.min, 90);
      assert.equal(range.max, 110);
    });

    it('pro-rated from 15th: remaining inclusive days → ₹1,600', () => {
      // Remaining days = 30 - 15 + 1 = 16
      // (10000 * 30% / 30) * 16 = 100 * 16 = 1600
      assert.equal(calculateProRatedAmount(capital, roi, 15, days), 1600);
    });

    it('last day equals monthly total minus sum of prior days', () => {
      const amounts = calculateDailyAmounts(3000, 30, 0, 30);
      assert.equal(amounts.length, 30);

      const prior = amounts.slice(0, 29);
      for (const amt of prior) {
        assert.ok(amt >= 90 && amt <= 110, `day amount ${amt} outside 90–110`);
      }

      const last = amounts[29];
      const sumPrior = prior.reduce((a, b) => a + b, 0);
      assert.equal(last, 3000 - sumPrior);
      assert.equal(sumPrior + last, 3000);
    });
  });

  describe('calculateMonthlyAmount', () => {
    it('uses Math.round and whole rupees', () => {
      assert.equal(calculateMonthlyAmount(10001, 30), Math.round((10001 * 30) / 100));
    });

    it('returns 0 for zero/negative capital or ROI', () => {
      assert.equal(calculateMonthlyAmount(0, 30), 0);
      assert.equal(calculateMonthlyAmount(10000, 0), 0);
      assert.equal(calculateMonthlyAmount(-1, 30), 0);
    });
  });

  describe('calculateDailyAverage', () => {
    it('Daily Average = (Capital × ROI%) / Days in Month (rounded)', () => {
      const monthly = calculateMonthlyAmount(50000, 24, 31);
      assert.equal(calculateDailyAverage(50000, 24, 31), Math.round(monthly / 31));
    });

    it('returns 0 when daysInMonth is invalid', () => {
      assert.equal(calculateDailyAverage(10000, 30, 0), 0);
    });
  });

  describe('getDailyRange', () => {
    it('min = round(avg × 0.9), max = round(avg × 1.1)', () => {
      assert.deepEqual(getDailyRange(100), { min: 90, max: 110 });
      assert.deepEqual(getDailyRange(0), { min: 0, max: 0 });
    });
  });

  describe('calculateProRatedAmount', () => {
    it('Remaining days = D - X + 1 (inclusive start day)', () => {
      // Knowledge example wording: invested on 15th → 16 remaining days
      assert.equal(calculateProRatedAmount(10000, 30, 15, 30), 1600);
    });

    it('full month when startDay = 1', () => {
      assert.equal(calculateProRatedAmount(10000, 30, 1, 30), 3000);
    });

    it('returns 0 for invalid start day', () => {
      assert.equal(calculateProRatedAmount(10000, 30, 0, 30), 0);
      assert.equal(calculateProRatedAmount(10000, 30, 31, 30), 0);
    });
  });

  describe('calculateDailyAmounts', () => {
    it('sum of all days equals monthly total', () => {
      for (let i = 0; i < 5; i += 1) {
        const amounts = calculateDailyAmounts(3000, 30);
        const sum = amounts.reduce((a, b) => a + b, 0);
        assert.equal(sum, 3000);
      }
    });

    it('non-last days stay within feasible 90–110% band', () => {
      const amounts = calculateDailyAmounts(3100, 31);
      const avg = Math.round(3100 / 31);
      const { min, max } = getDailyRange(avg);
      for (const amt of amounts.slice(0, -1)) {
        assert.ok(amt >= min && amt <= max);
      }
    });

    it('respects creditedSoFar when generating remaining days', () => {
      const remaining = calculateDailyAmounts(3000, 30, 1500, 15);
      assert.equal(remaining.length, 15);
      assert.equal(
        1500 + remaining.reduce((a, b) => a + b, 0),
        3000
      );
    });

    it('last day may fall outside 90–110% (acceptable per rules)', () => {
      // Force a skewed remainder by pre-crediting near the top of the band
      const amounts = calculateDailyAmounts(3000, 30, 0, 2);
      assert.equal(amounts.length, 2);
      assert.equal(amounts[0] + amounts[1], 3000);
    });
  });

  describe('calculateSegmentedMonthTotal (mid-month capital change)', () => {
    it('sums daily averages across capital segments', () => {
      // Days 1–10 @ 10k/30%, days 11–30 @ 20k/30% in a 30-day month
      const total = calculateSegmentedMonthTotal(
        [
          { capital: 10000, roiPercent: 30, startDay: 1, endDay: 10 },
          { capital: 20000, roiPercent: 30, startDay: 11, endDay: 30 },
        ],
        30
      );
      const avg1 = calculateDailyAverage(10000, 30, 30);
      const avg2 = calculateDailyAverage(20000, 30, 30);
      assert.equal(total, avg1 * 10 + avg2 * 20);
    });
  });

  describe('calendar helpers', () => {
    it('getDaysInMonth handles Feb leap/non-leap', () => {
      assert.equal(getDaysInMonth(2024, 2), 29);
      assert.equal(getDaysInMonth(2025, 2), 28);
      assert.equal(getDaysInMonth(2024, 1), 31);
    });

    it('isLastDayOfMonth detects month end in IST', () => {
      assert.equal(isLastDayOfMonth(new Date('2024-01-31T12:00:00+05:30')), true);
      assert.equal(isLastDayOfMonth(new Date('2024-01-30T12:00:00+05:30')), false);
    });
  });
});
