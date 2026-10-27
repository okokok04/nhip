import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { micro } from './money.ts';
import {
  WEI_PER_MICRO,
  canConfirm,
  canSubmit,
  quoteBatchFee,
  settleBatchState,
} from './settlement.ts';

// Gas đo thật trên Arc Testnet (2026-10-27): 49.338 cho ví đã có token, 74.826 cho ví lạnh.
const GAS_WARM = 49_338n;
const GAS_COLD = 74_826n;
const GWEI_25 = 25_000_000_000n;

describe('quoteBatchFee', () => {
  it('nhân gas theo số payout rồi nhân giá gas', () => {
    const quote = quoteBatchFee({
      payoutCount: 3,
      measuredGasPerTransfer: GAS_WARM,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      relayerBalance: micro(100_000_000n),
      totalMicro: micro(3_000_000n),
    });

    assert.equal(quote.gas, GAS_WARM * 3n);
    assert.equal(quote.maxFeeWei, GAS_WARM * 3n * GWEI_25);
    assert.equal(quote.gasMeasured, true);
    // 49.338 * 3 * 25e9 = 3.70035e15 wei = 3700,35 micro → làm tròn lên 3701
    assert.equal(quote.maxFeeMicro, 3_701n);
  });

  it('làm tròn phí LÊN, không bao giờ xuống', () => {
    // 1 gas * 1 wei = 1 wei, tức 0,000000000001 micro. Làm tròn xuống sẽ thành 0 —
    // nghĩa là báo "miễn phí" cho một giao dịch có phí.
    const quote = quoteBatchFee({
      payoutCount: 1,
      measuredGasPerTransfer: 1n,
      fallbackGasPerTransfer: 1n,
      maxFeePerGasWei: 1n,
      relayerBalance: micro(0n),
      totalMicro: micro(1n),
    });
    assert.equal(quote.maxFeeWei, 1n);
    assert.equal(quote.maxFeeMicro, 1n, 'phí lẻ dưới 1 micro phải làm tròn lên 1 micro');
  });

  it('không đo được gas thì dùng cận trên và nói rõ là ước lượng', () => {
    const quote = quoteBatchFee({
      payoutCount: 2,
      measuredGasPerTransfer: null,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      relayerBalance: micro(100_000_000n),
      totalMicro: micro(2_000_000n),
    });
    assert.equal(quote.gasMeasured, false);
    assert.equal(quote.gasPerTransfer, GAS_COLD);
    assert.equal(quote.gas, GAS_COLD * 2n);
  });

  it('thiếu tiền thì nói rõ thiếu bao nhiêu, không chỉ nói "không đủ"', () => {
    const quote = quoteBatchFee({
      payoutCount: 100,
      measuredGasPerTransfer: GAS_COLD,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      // 100 payout * 1 USDC = 100 USDC, nhưng chỉ có 99 USDC.
      relayerBalance: micro(99_000_000n),
      totalMicro: micro(100_000_000n),
    });

    assert.equal(quote.affordable, false);
    // Thiếu = (tiền + phí) - số dư. Phí phải được tính vào, không chỉ tính tiền.
    assert.equal(quote.shortfallMicro, micro(1_000_000n) + quote.maxFeeMicro);
  });

  it('tính phí vào khả năng chi trả: đủ tiền nhưng không đủ tiền + phí là KHÔNG đủ', () => {
    const totalMicro = micro(1_000_000n);
    const quote = quoteBatchFee({
      payoutCount: 1,
      measuredGasPerTransfer: GAS_COLD,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      // Đúng bằng tiền cần trả, không dư một micro nào cho phí.
      relayerBalance: totalMicro,
      totalMicro,
    });
    assert.equal(quote.affordable, false, 'không còn gì trả phí gas');
    assert.equal(quote.shortfallMicro, quote.maxFeeMicro);
  });

  it('trả 0 shortfall khi đủ', () => {
    const totalMicro = micro(1_000_000n);
    const quote = quoteBatchFee({
      payoutCount: 1,
      measuredGasPerTransfer: GAS_WARM,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      relayerBalance: micro(2_000_000n),
      totalMicro,
    });
    assert.equal(quote.affordable, true);
    assert.equal(quote.shortfallMicro, 0n);
  });

  it('từ chối cấu hình vô lý thay vì trả báo giá sai', () => {
    const base = {
      measuredGasPerTransfer: GAS_WARM,
      fallbackGasPerTransfer: GAS_COLD,
      maxFeePerGasWei: GWEI_25,
      relayerBalance: micro(1_000_000n),
      totalMicro: micro(1_000_000n),
    };
    assert.throws(() => quoteBatchFee({ ...base, payoutCount: 0 }), /payoutCount/);
    assert.throws(() => quoteBatchFee({ ...base, payoutCount: 1, maxFeePerGasWei: 0n }), /maxFeePerGas/);
    assert.throws(
      () => quoteBatchFee({ ...base, payoutCount: 1, measuredGasPerTransfer: 0n, fallbackGasPerTransfer: 0n }),
      /gas mỗi transfer/,
    );
  });

  it('1 micro = 10^12 wei, không phải 10^18', () => {
    assert.equal(WEI_PER_MICRO, 1_000_000_000_000n);
    // Sai hệ số này là sai 10^6 lần trên mọi báo giá — test giữ nó bằng số, không bằng comment.
    assert.equal(WEI_PER_MICRO * 1_000_000n, 10n ** 18n);
  });

  it('999.999 wei vẫn làm tròn lên 1 micro', () => {
    const quote = quoteBatchFee({
      payoutCount: 1,
      measuredGasPerTransfer: 999_999n,
      fallbackGasPerTransfer: 999_999n,
      maxFeePerGasWei: 1n,
      relayerBalance: micro(10n),
      totalMicro: micro(1n),
    });
    assert.equal(quote.maxFeeMicro, 1n);
  });
});

describe('canSubmit / canConfirm — cổng trạng thái', () => {
  it('chỉ lô planned mới được gửi', () => {
    assert.equal(canSubmit('planned'), true);
    for (const state of ['submitting', 'confirmed', 'partial', 'failed', 'unknown']) {
      assert.equal(canSubmit(state), false, `không được gửi lại lô ${state}`);
    }
  });

  it('unknown KHÔNG được gửi lại nhưng được phép đọc receipt (B6)', () => {
    // B6: blocklist revert trên Arc tiêu gas mà không sinh receipt. Gửi lại là mất tiền
    // hai lần. Nhưng đọc receipt thì không gửi gì, và là cách duy nhất để thoát unknown.
    assert.equal(canSubmit('unknown'), false);
    assert.equal(canConfirm('unknown'), true);
  });

  it('planned không có gì để confirm', () => {
    assert.equal(canConfirm('planned'), false);
  });
});

describe('settleBatchState — trạng thái lô suy từ payout', () => {
  it('tất cả confirmed → confirmed', () => {
    assert.equal(
      settleBatchState({ confirmedCount: 5, submittedCount: 0, failedCount: 0, unknownCount: 0 }),
      'confirmed',
    );
  });

  it('còn payout đang gửi → submitting', () => {
    assert.equal(
      settleBatchState({ confirmedCount: 4, submittedCount: 1, failedCount: 0, unknownCount: 0 }),
      'submitting',
    );
  });

  it('một phần confirmed, phần còn lại failed → partial, không phải confirmed', () => {
    assert.equal(
      settleBatchState({ confirmedCount: 199, submittedCount: 0, failedCount: 1, unknownCount: 0 }),
      'partial',
    );
  });

  it('tất cả failed → failed', () => {
    assert.equal(
      settleBatchState({ confirmedCount: 0, submittedCount: 0, failedCount: 3, unknownCount: 0 }),
      'failed',
    );
  });

  it('còn một payout unknown → unknown, thắng mọi trạng thái khác', () => {
    // Một lô mà 199 người nhận tiền và 1 người chưa rõ KHÔNG được báo "đã xong".
    assert.equal(
      settleBatchState({ confirmedCount: 199, submittedCount: 0, failedCount: 0, unknownCount: 1 }),
      'unknown',
    );
    assert.equal(
      settleBatchState({ confirmedCount: 0, submittedCount: 0, failedCount: 0, unknownCount: 1 }),
      'unknown',
    );
  });
});
