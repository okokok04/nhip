/**
 * `/v1/settlement` — báo giá và gửi tiền thật lên Arc.
 *
 * Đây là tính năng biến sản phẩm từ "dashboard nói rằng đã trả" thành "hệ thống đã trả,
 * và có hash để kiểm". Ba quyết định định hình file này:
 *
 * 1. **Báo giá là một bước riêng, bắt buộc, trước khi gửi.** Người vận hành bấm "gửi"
 *    với một con số phí cụ thể trên màn hình. Gửi mà không có báo giá là ký một tờ séc
 *    trắng — và trên Arc, tx dưới sàn gas treo vô hạn thay vì fail (B4).
 *
 * 2. **Gửi là bất đồng bộ với chain nhưng đồng bộ với nonce.** Endpoint gửi trả `202`
 *    ngay khi transaction đã được broadcast, không chờ block (B5). Nhưng nonce phải cấp
 *    tuần tự trong một lần gọi, nếu không N tx cùng đọc một `pending nonce` và đè nhau.
 *
 * 3. **`unknown` không bao giờ bị gửi lại (B6).** Blocklist revert trên Arc tiêu gas mà
 *    không sinh receipt. Retry tự động là mất tiền hai lần cho cùng một người.
 */

import { Hono } from 'hono';

import type { Database } from '../../../packages/db/src/client.ts';
import type { Address } from '../../../packages/core/src/address.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import { micro } from '../../../packages/core/src/money.ts';
import {
  canConfirm,
  canSubmit,
  quoteBatchFee,
  settleBatchState,
} from '../../../packages/core/src/settlement.ts';
import {
  findBatchById,
  type BatchRow,
} from './batches.repo.ts';
import type { ChainGateway } from './chain.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode } from './errors.ts';
import { GAS_PER_PAYOUT_ESTIMATE } from './gas.ts';
import type { RouteOptions } from './payouts.route.ts';
import {
  applyReceipts,
  listPayoutsToSettle,
  listPayoutsWithoutAddress,
  listSettleableBatches,
  markPayoutsSubmitted,
  readBatchState,
  readQuote,
  saveQuote,
  setBatchState,
  setBatchSubmitting,
  sumBatchAmount,
  toTally,
  type ReceiptUpdate,
} from './settlement.repo.ts';
import { newCollector, takeLimit } from './validate.ts';

export interface SettlementRoutesOptions extends RouteOptions {
  /**
   * `null` = chưa cấu hình ví trả tiền. Báo giá vẫn chạy (nó chỉ đọc), nhưng gửi thì
   * từ chối với lý do rõ ràng thay vì giả vờ thành công.
   */
  readonly chain: ChainGateway | null;
}

/** Báo giá cũ hơn mức này thì không dùng để gửi: phí gas đã đổi. */
const QUOTE_MAX_AGE_MS = 5 * 60 * 1000;

function requireChain(chain: ChainGateway | null): ChainGateway {
  if (!chain) {
    throw new AppError(
      ErrorCode.CHAIN_UNAVAILABLE,
      'Chưa cấu hình ví trả tiền trên Arc. Đặt RELAYER_PRIVATE_KEY rồi khởi động lại API. ' +
        'Không có khoá thì hệ thống chỉ báo giá được, không gửi được — và sẽ không giả vờ đã gửi.',
    );
  }
  return chain;
}

export function createSettlementRoutes(options: SettlementRoutesOptions): Hono<AppEnv> {
  const { db, chain } = options;
  const routes = new Hono<AppEnv>();

  /**
   * `POST /v1/settlement/batches/:id/quote`
   *
   * Vì sao POST chứ không GET: nó ghi bốn cột vào DB (báo giá được lưu để đối soát).
   * Một GET có side effect là thứ khiến cache và retry của proxy trở thành bug.
   */
  routes.post('/batches/:id/quote', async (c) => {
    const platform = c.get('platform');
    const gateway = requireChain(chain);
    const batch = await findBatchById(db, platform.id, c.req.param('id'));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lô.');

    if (!canSubmit(batch.state)) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Chỉ lô ở trạng thái "planned" mới báo giá được. Lô này đang "${batch.state}".`,
      );
    }

    const [payouts, unpayable, totalMicro] = await Promise.all([
      listPayoutsToSettle(db, platform.id, batch.id),
      listPayoutsWithoutAddress(db, platform.id, batch.id),
      sumBatchAmount(db, platform.id, batch.id),
    ]);

    if (payouts.length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        unpayable.length > 0
          ? `Không payout nào trong lô có địa chỉ ví. ${unpayable.length} người chưa liên kết ví — cập nhật địa chỉ trước khi trả.`
          : 'Lô này không còn payout nào chờ gửi.',
        unpayable.length > 0 ? { unpayable: unpayable.map((p) => p.worker_id) } : undefined,
      );
    }

    // Đo gas cho **một** transfer tới người nhận thật, rồi nhân lên. Không đo từng người:
    // 133 lần `eth_estimateGas` cho một lần bấm nút là 133 round trip, và chênh lệch giữa
    // các ví chỉ nằm ở cold/warm — đã được bao bởi cận trên.
    const first = payouts[0];
    if (!first?.address) {
      throw new AppError(ErrorCode.INTERNAL, 'Payout đầu tiên không có địa chỉ sau khi đã lọc — lỗi logic.');
    }

    let measuredGas: bigint | null = null;
    try {
      measuredGas = await gateway.estimateTransferGas(first.address as Address);
    } catch {
      // RPC lỗi không được làm hỏng báo giá: dùng cận trên đã đo, và nói rõ đó là ước lượng.
      measuredGas = null;
    }

    const fees = await gateway.getFees();
    const relayerBalance = await gateway.usdcBalanceOf(gateway.relayerAddress);

    const quote = quoteBatchFee({
      payoutCount: payouts.length,
      measuredGasPerTransfer: measuredGas,
      fallbackGasPerTransfer: GAS_PER_PAYOUT_ESTIMATE,
      maxFeePerGasWei: fees.maxFeePerGasWei,
      relayerBalance,
      totalMicro,
    });

    const at = new Date();
    await saveQuote(db, platform.id, batch.id, {
      gas: quote.gas,
      maxFeePerGasWei: quote.maxFeePerGasWei,
      maxFeeWei: quote.maxFeeWei,
      at,
    });

    return c.json({
      batchId: batch.id,
      network: gateway.network,
      chainId: gateway.chainId,
      relayerAddress: gateway.relayerAddress,
      usdcAddress: gateway.usdcAddress,
      payoutCount: payouts.length,
      skippedWithoutAddress: unpayable.length,
      total_micro: totalMicro.toString(),
      gas: quote.gas.toString(),
      gasPerTransfer: quote.gasPerTransfer.toString(),
      gasMeasured: quote.gasMeasured,
      gasPriceWei: fees.gasPriceWei.toString(),
      baseFeeWei: fees.baseFeeWei?.toString() ?? null,
      maxFeePerGasWei: quote.maxFeePerGasWei.toString(),
      maxFeeWei: quote.maxFeeWei.toString(),
      maxFeeMicro: quote.maxFeeMicro.toString(),
      relayerBalanceMicro: relayerBalance.toString(),
      affordable: quote.affordable,
      shortfallMicro: quote.shortfallMicro.toString(),
      quotedAt: at.toISOString(),
      quoteValidForMs: QUOTE_MAX_AGE_MS,
    });
  });

  /**
   * `POST /v1/settlement/batches/:id/submit`
   *
   * Trả `202` sau khi đã broadcast. Không chờ receipt: một lô 133 người có thể mất vài
   * block, và nền tảng không được bị chặn bởi tốc độ chain (B5).
   */
  routes.post('/batches/:id/submit', async (c) => {
    const platform = c.get('platform');
    const gateway = requireChain(chain);
    const batch = await findBatchById(db, platform.id, c.req.param('id'));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lô.');

    if (!canSubmit(batch.state)) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Không gửi lại được lô đang "${batch.state}". Chỉ lô "planned" mới gửi được. ` +
          'Lô "unknown" phải được đối soát bằng endpoint /confirm, không được gửi lại (B6).',
      );
    }

    const quote = await requireFreshQuote(db, platform.id, batch);

    const [payouts, unpayable, totalMicro] = await Promise.all([
      listPayoutsToSettle(db, platform.id, batch.id),
      listPayoutsWithoutAddress(db, platform.id, batch.id),
      sumBatchAmount(db, platform.id, batch.id),
    ]);

    if (payouts.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Lô này không còn payout nào chờ gửi.');
    }

    // Kiểm lại số dư ngay trước khi gửi: báo giá có thể đã cũ, và tiền có thể vừa bị
    // dùng cho lô khác. Gửi một loạt transfer rồi hỏng ở cái thứ 90 tệ hơn nhiều so với
    // từ chối trước khi gửi cái đầu.
    const balance = await gateway.usdcBalanceOf(gateway.relayerAddress);
    const needed = totalMicro + quote.feeMicro;
    if (balance < needed) {
      throw new AppError(
        ErrorCode.INSUFFICIENT_BALANCE,
        `Ví trả tiền thiếu USDC: cần ${needed.toString()} micro (gồm phí), có ${balance.toString()} micro. ` +
          'Nạp thêm vào địa chỉ của relayer rồi báo giá lại.',
        {
          neededMicro: needed.toString(),
          balanceMicro: balance.toString(),
          relayerAddress: gateway.relayerAddress,
        },
      );
    }

    // Nonce cấp một lần, tăng dần. Hai request submit song song trên cùng một relayer sẽ
    // va nonce; đây là lý do `setBatchSubmitting` chỉ chuyển được từ `planned` — request
    // thứ hai update 0 dòng và bị từ chối ở dưới.
    let nonce = await gateway.getNextNonce();
    const submittedAt = new Date();

    const claimed = await setBatchSubmitting(db, platform.id, batch.id, gateway.network, submittedAt);
    if (claimed === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Lô này vừa được một request khác gửi. Không gửi lại.');
    }

    const sent: { payoutId: string; txHash: string }[] = [];
    const failures: { payoutId: string; reason: string }[] = [];

    for (const payout of payouts) {
      if (!payout.address) {
        failures.push({ payoutId: payout.id, reason: 'Người nhận chưa có địa chỉ ví.' });
        continue;
      }

      try {
        const result = await gateway.sendUsdcTransfer({
          to: payout.address as Address,
          amountMicro: BigInt(payout.amount_micro) as Micro,
          nonce,
          maxFeePerGasWei: quote.maxFeePerGasWei,
        });
        sent.push({ payoutId: payout.id, txHash: result.txHash });
        nonce += 1;
      } catch (error) {
        // Broadcast hỏng: nonce có thể đã bị tiêu hoặc chưa. Không đoán — dừng lô lại và
        // trả về những gì đã gửi được. Người vận hành cần biết chính xác ai đã được gửi.
        failures.push({
          payoutId: payout.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (sent.length > 0) {
      await markPayoutsSubmitted(db, platform.id, batch.id, sent, submittedAt);
    }

    if (sent.length === 0) {
      await setBatchState(
        db,
        platform.id,
        batch.id,
        'failed',
        failures[0]?.reason ?? 'Không broadcast được transaction nào.',
      );
      throw new AppError(
        ErrorCode.CHAIN_UNAVAILABLE,
        `Không gửi được transaction nào. Lý do đầu tiên: ${failures[0]?.reason ?? 'không rõ'}.`,
        { failures },
      );
    }

    const state = await readBatchState(db, platform.id, batch.id);
    if (state) {
      await setBatchState(db, platform.id, batch.id, settleBatchState(toTally(state)), null);
    }

    return c.json(
      {
        batchId: batch.id,
        state: 'submitting',
        network: gateway.network,
        relayerAddress: gateway.relayerAddress,
        sentCount: sent.length,
        failedToSendCount: failures.length,
        skippedWithoutAddress: unpayable.length,
        transactions: sent,
        failures,
        // Không chờ chain: nói rõ bước tiếp theo để client không tự gọi lại submit.
        next: `POST /v1/settlement/batches/${batch.id}/confirm để đọc receipt.`,
      },
      202,
    );
  });

  /**
   * `POST /v1/settlement/batches/:id/confirm` — đọc receipt và ghi kết quả.
   *
   * Idempotent: gọi lại chỉ đọc lại những payout còn `submitted`. Không gửi gì lên chain,
   * nên gọi nhiều lần là an toàn — khác `submit`.
   */
  routes.post('/batches/:id/confirm', async (c) => {
    const platform = c.get('platform');
    const gateway = requireChain(chain);
    const batch = await findBatchById(db, platform.id, c.req.param('id'));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lô.');

    if (!canConfirm(batch.state)) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Lô đang "${batch.state}" — không có transaction nào để đối soát.`,
      );
    }

    const submitted = await listSubmittedPayouts(db, platform.id, batch.id);
    if (submitted.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Lô này không có transaction nào đang chờ xác nhận.');
    }

    const updates: ReceiptUpdate[] = [];
    for (const payout of submitted) {
      const receipt = await gateway.getReceipt(payout.tx_hash as `0x${string}`);
      if (receipt.status === 'pending') {
        updates.push({ payoutId: payout.id, outcome: { status: 'pending' } });
        continue;
      }
      if (receipt.status === 'success') {
        updates.push({
          payoutId: payout.id,
          outcome: {
            status: 'success',
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
          },
        });
        continue;
      }
      updates.push({
        payoutId: payout.id,
        outcome: {
          status: 'reverted',
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          reason: receipt.reason,
        },
      });
    }

    const confirmedAt = new Date();
    const changed = await applyReceipts(db, platform.id, batch.id, updates, confirmedAt);

    const state = await readBatchState(db, platform.id, batch.id);
    if (!state) throw new AppError(ErrorCode.INTERNAL, 'Không đọc lại được trạng thái lô — lỗi logic.');

    const tally = toTally(state);
    const batchState = settleBatchState(tally);

    // `submitting` khi vẫn còn tx trong mempool không phải trạng thái cuối. Ghi lại để
    // lần gọi sau còn biết phải đọc tiếp.
    await setBatchState(
      db,
      platform.id,
      batch.id,
      batchState,
      tally.failedCount > 0
        ? `${tally.failedCount} payout revert trên chain. Xem failure_reason từng dòng.`
        : null,
    );

    return c.json({
      batchId: batch.id,
      state: batchState,
      changed,
      tally,
      payouts: await listSettlementPayouts(db, platform.id, batch.id),
    });
  });

  /**
   * `GET /v1/settlement/batches` — lô còn dở ở bước settlement.
   *
   * Vì sao không tái dùng `/v1/overview.recentBatches`: endpoint kia trộn cả lô đã xong
   * và lô demo, và chỉ trả 8 dòng mới nhất. Màn hình gửi tiền cần đúng danh sách việc
   * còn phải làm, sắp theo thứ tự tạo để lô cũ nhất không bị bỏ quên.
   */
  routes.get('/batches', async (c) => {
    const platform = c.get('platform');
    const collector = newCollector();
    const limit = takeLimit(c.req.query('limit'), collector, { fallback: 50, max: 200 });
    collector.throwIfAny();

    const batches = await listSettleableBatches(db, platform.id, limit ?? 50);
    return c.json({
      batches: batches.map((batch) => ({
        id: batch.id,
        state: batch.state,
        payoutCount: batch.payout_count,
        total_micro: batch.total_micro,
        settlementMode: batch.settlement_mode,
        created_at: batch.created_at.toISOString(),
      })),
      chainConfigured: chain !== null,
    });
  });

  /** Trạng thái settlement của một lô, không đụng chain. Dùng để poll từ UI. */
  routes.get('/batches/:id', async (c) => {
    const platform = c.get('platform');
    const batch = await findBatchById(db, platform.id, c.req.param('id'));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lô.');

    const [state, payouts, quote] = await Promise.all([
      readBatchState(db, platform.id, batch.id),
      listSettlementPayouts(db, platform.id, batch.id),
      readQuote(db, platform.id, batch.id),
    ]);
    if (!state) throw new AppError(ErrorCode.INTERNAL, 'Không đọc được trạng thái lô — lỗi logic.');

    return c.json({
      batchId: batch.id,
      state: state.state,
      settlementMode: state.settlement_mode,
      total_micro: state.total_micro,
      tally: toTally(state),
      canSubmit: canSubmit(state.state),
      canConfirm: canConfirm(state.state),
      chainConfigured: chain !== null,
      network: chain?.network ?? null,
      quote: quote?.quoted_at
        ? {
            gas: quote.quoted_gas,
            maxFeePerGasWei: quote.quoted_gas_price_wei,
            maxFeeWei: quote.quoted_fee_wei,
            quotedAt: quote.quoted_at.toISOString(),
          }
        : null,
      payouts,
    });
  });

  return routes;
}

interface FreshQuote {
  readonly maxFeePerGasWei: bigint;
  readonly feeMicro: Micro;
}

/**
 * Báo giá phải tồn tại, và phải còn mới.
 *
 * Vì sao không tự báo giá lại ở đây: người vận hành phải nhìn thấy con số họ sắp đồng ý.
 * Tự báo giá lại trong `submit` nghĩa là bấm "gửi" có thể gửi với phí khác lần trước.
 */
async function requireFreshQuote(db: Database, platformId: string, batch: BatchRow): Promise<FreshQuote> {
  const quote = await readQuote(db, platformId, batch.id);
  if (!quote?.quoted_at || quote.quoted_gas_price_wei === null || quote.quoted_fee_wei === null) {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      `Lô ${batch.id} chưa có báo giá. Gọi POST /v1/settlement/batches/${batch.id}/quote trước khi gửi.`,
    );
  }

  const ageMs = Date.now() - quote.quoted_at.getTime();
  if (ageMs > QUOTE_MAX_AGE_MS) {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      `Báo giá đã ${Math.round(ageMs / 1000)}s tuổi (tối đa ${QUOTE_MAX_AGE_MS / 1000}s). ` +
        'Phí gas đã có thể đổi — báo giá lại rồi mới gửi.',
    );
  }

  // Phí quy từ wei sang micro, làm tròn LÊN — cùng quy tắc đã dùng khi báo giá.
  const feeWei = BigInt(quote.quoted_fee_wei);
  const WEI_PER_MICRO = 1_000_000_000_000n;
  return {
    maxFeePerGasWei: BigInt(quote.quoted_gas_price_wei),
    feeMicro: micro((feeWei + WEI_PER_MICRO - 1n) / WEI_PER_MICRO),
  };
}

interface SubmittedPayout {
  readonly id: string;
  readonly tx_hash: string;
}

async function listSubmittedPayouts(db: Database, platformId: string, batchId: string): Promise<SubmittedPayout[]> {
  const result = await db.query<SubmittedPayout>(
    `SELECT id, tx_hash FROM payouts
      WHERE platform_id = $1 AND batch_id = $2 AND state = 'submitted' AND tx_hash IS NOT NULL
      ORDER BY created_at ASC, id ASC`,
    [platformId, batchId],
  );
  return result.rows;
}

interface SettlementPayout {
  readonly id: string;
  readonly workerId: string;
  readonly amount_micro: string;
  readonly state: string;
  readonly txHash: string | null;
  readonly blockNumber: string | null;
  readonly gasUsed: string | null;
  readonly failureReason: string | null;
  readonly confirmedAt: string | null;
}

async function listSettlementPayouts(
  db: Database,
  platformId: string,
  batchId: string,
): Promise<SettlementPayout[]> {
  const result = await db.query<{
    id: string;
    worker_id: string;
    amount_micro: string;
    state: string;
    tx_hash: string | null;
    block_number: string | null;
    gas_used: string | null;
    failure_reason: string | null;
    confirmed_at: Date | null;
  }>(
    `SELECT id, worker_id, amount_micro::text AS amount_micro, state, tx_hash,
            block_number::text AS block_number, gas_used::text AS gas_used,
            failure_reason, confirmed_at
       FROM payouts
      WHERE platform_id = $1 AND batch_id = $2
      ORDER BY created_at ASC, id ASC`,
    [platformId, batchId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    workerId: row.worker_id,
    amount_micro: row.amount_micro,
    state: row.state,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    gasUsed: row.gas_used,
    failureReason: row.failure_reason,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
  }));
}
