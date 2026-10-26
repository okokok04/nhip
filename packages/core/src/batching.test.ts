import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BatchPlanError, planBatches } from './batching.ts';
import type { Micro } from './money.ts';
import { micro, sum } from './money.ts';

interface Payout {
  readonly id: number;
  readonly amount_micro: Micro;
}

const payouts = (count: number, each = 1_000_000): Payout[] =>
  Array.from({ length: count }, (_, index) => ({ id: index, amount_micro: micro(BigInt(each)) }));

const OPTS = { gasBudget: 10_000_000n, gasPerPayout: 28_000n, maxBatchSize: 500 };
// 10_000_000 / 28_000 = 357 (làm tròn xuống)

describe('planBatches', () => {
  it('danh sách rỗng → không lô nào', () => {
    const result = planBatches([], OPTS);
    assert.deepEqual(result.batches, []);
    assert.deepEqual(result.gasPerBatch, []);
  });

  it('ít hơn một lô → một lô', () => {
    const items = payouts(100);
    const result = planBatches(items, OPTS);
    assert.equal(result.batches.length, 1);
    assert.equal(result.batches[0]?.length, 100);
  });

  it('giới hạn bởi gas, không phải maxBatchSize khi gas là ràng buộc', () => {
    const result = planBatches(payouts(1000), OPTS);
    assert.equal(result.batches[0]?.length, 357);
    assert.equal(result.batches.length, 3); // 357 + 357 + 286
  });

  it('giới hạn bởi maxBatchSize khi nó nhỏ hơn', () => {
    const result = planBatches(payouts(100), { ...OPTS, maxBatchSize: 10 });
    assert.equal(result.batches.length, 10);
    assert.ok(result.batches.every((batch) => batch.length === 10));
  });

  it('KHÔNG mất và KHÔNG nhân đôi payout', () => {
    const items = payouts(1234, 1_500_000);
    const result = planBatches(items, OPTS);

    const flattened = result.batches.flat();
    assert.equal(flattened.length, items.length);

    // Đúng thứ tự, đúng từng phần tử — dùng id vì object không so sánh theo giá trị.
    assert.deepEqual(
      flattened.map((payout) => payout.id),
      items.map((payout) => payout.id),
    );

    // Bảo toàn tổng tiền.
    assert.equal(sum(flattened.map((p) => p.amount_micro)), sum(items.map((p) => p.amount_micro)));
  });

  it('không lô nào vượt gasBudget', () => {
    const result = planBatches(payouts(2000), OPTS);
    for (const gas of result.gasPerBatch) {
      assert.ok(gas <= OPTS.gasBudget, `lô cần ${gas} gas, vượt ${OPTS.gasBudget}`);
    }
  });

  it('gasPerBatch khớp với kích thước lô', () => {
    const result = planBatches(payouts(800), OPTS);
    result.batches.forEach((batch, index) => {
      assert.equal(result.gasPerBatch[index], BigInt(batch.length) * OPTS.gasPerPayout);
    });
  });

  it('deterministic: cùng input → cùng output', () => {
    const items = payouts(999);
    assert.deepEqual(planBatches(items, OPTS), planBatches(items, OPTS));
  });

  it('không mutate input', () => {
    const items = payouts(50);
    const snapshot = structuredClone(items);
    planBatches(items, OPTS);
    assert.deepEqual(items, snapshot);
  });

  it('từ chối cấu hình vô lý', () => {
    assert.throws(() => planBatches(payouts(1), { ...OPTS, gasPerPayout: 0n }), BatchPlanError);
    assert.throws(() => planBatches(payouts(1), { ...OPTS, gasBudget: 27_999n }), BatchPlanError);
    assert.throws(() => planBatches(payouts(1), { ...OPTS, maxBatchSize: 0 }), BatchPlanError);
    assert.throws(() => planBatches(payouts(1), { ...OPTS, maxBatchSize: 2.5 }), BatchPlanError);
  });
});
