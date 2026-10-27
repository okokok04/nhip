/**
 * Toán của bước settlement — phần thuần, không I/O.
 *
 * File này tồn tại vì hai con số khác đơn vị gặp nhau ở đây và chỉ ở đây:
 *
 * - **Phí gas** tính bằng **wei** (native USDC, 18 decimals).
 * - **Số tiền trả** tính bằng **micro** (ERC-20 USDC, 6 decimals).
 *
 * Trên Arc, native USDC và ERC-20 USDC là *cùng một tài sản* nhưng khác interface:
 * đo thật trên testnet, `getBalance` trả `21782614748319231470` wei trong khi
 * `balanceOf` trả `21782614` micro — chênh đúng 10^12 lần (phần lẻ dưới micro là
 * wei thừa không quy đổi được). Nên quy đổi **chỉ** được làm bằng `bigint`, và luôn
 * làm tròn **lên**: phí là thứ phải trả, làm tròn xuống nghĩa là báo giá thiếu.
 *
 * Vì sao tách khỏi route: báo giá sai là lỗi tốn tiền thật, nên nó phải được test
 * bằng số, không bằng cách mở trình duyệt xem có vẻ đúng không.
 */

import { type Micro, micro } from './money.ts';

/** 1 micro-USDC = 10^12 wei. Không phải 10^18 — đó là số của token 18 decimals. */
export const WEI_PER_MICRO = 1_000_000_000_000n;

export interface QuoteInput {
  readonly payoutCount: number;
  /**
   * Gas đo được cho **một** transfer, hoặc `null` nếu không đo được (RPC lỗi).
   * `null` nghĩa là báo giá phải nói "không biết", không được đoán.
   */
  readonly measuredGasPerTransfer: bigint | null;
  /** Gas dùng khi không đo được — cận trên đã đo trên Arc cho ví lạnh. */
  readonly fallbackGasPerTransfer: bigint;
  /**
   * `maxFeePerGas` thực dùng. Luôn >= sàn 20 Gwei; caller chịu trách nhiệm.
   */
  readonly maxFeePerGasWei: bigint;
  /** Số dư USDC ERC-20 hiện có của ví trả tiền. */
  readonly relayerBalance: Micro;
  /** Tổng tiền của lô. */
  readonly totalMicro: Micro;
}

export interface Quote {
  /** Gas cho cả lô. */
  readonly gas: bigint;
  /** Gas dùng cho một transfer trong báo giá này. */
  readonly gasPerTransfer: bigint;
  /** true = gas là số đo thật; false = đang dùng cận trên. */
  readonly gasMeasured: boolean;
  readonly maxFeePerGasWei: bigint;
  /** Phí tối đa của cả lô, wei. Là **trần**, không phải hoá đơn. */
  readonly maxFeeWei: bigint;
  /** Trần phí quy ra micro-USDC, làm tròn lên. */
  readonly maxFeeMicro: Micro;
  /** Ví trả tiền có đủ cho *cả* tiền lẫn phí tối đa không. */
  readonly affordable: boolean;
  /** Thiếu bao nhiêu micro nếu không đủ. 0n khi đủ. */
  readonly shortfallMicro: Micro;
}

/**
 * Báo giá phí của một lô.
 *
 * Quy tắc: báo giá phải là **trần**, không phải ước lượng trung bình. Một báo giá thấp
 * hơn thực tế khiến người vận hành bấm "gửi" với niềm tin sai — tệ hơn không báo gì.
 */
export function quoteBatchFee(input: QuoteInput): Quote {
  if (!Number.isInteger(input.payoutCount) || input.payoutCount < 1) {
    throw new Error(`quoteBatchFee: payoutCount phải >= 1, nhận ${input.payoutCount}`);
  }
  if (input.maxFeePerGasWei <= 0n) {
    throw new Error('quoteBatchFee: maxFeePerGas phải > 0');
  }

  const gasMeasured = input.measuredGasPerTransfer !== null;
  const gasPerTransfer = input.measuredGasPerTransfer ?? input.fallbackGasPerTransfer;
  if (gasPerTransfer <= 0n) {
    throw new Error('quoteBatchFee: gas mỗi transfer phải > 0');
  }

  const gas = gasPerTransfer * BigInt(input.payoutCount);
  const maxFeeWei = gas * input.maxFeePerGasWei;
  // Làm tròn LÊN: phí lẻ dưới 1 micro vẫn là phí phải trả.
  const maxFeeMicro = micro((maxFeeWei + WEI_PER_MICRO - 1n) / WEI_PER_MICRO);

  const required = input.totalMicro + maxFeeMicro;
  const affordable = input.relayerBalance >= required;
  const shortfallMicro = affordable ? micro(0n) : micro(required - input.relayerBalance);

  return {
    gas,
    gasPerTransfer,
    gasMeasured,
    maxFeePerGasWei: input.maxFeePerGasWei,
    maxFeeWei,
    maxFeeMicro,
    affordable,
    shortfallMicro,
  };
}

/** Trạng thái mà một lô có thể nhận thêm bước settlement. Hàm thuần, dùng chung route + test. */
export type SettleableState = 'planned' | 'submitting' | 'confirmed' | 'partial' | 'failed' | 'unknown';

/**
 * Có được phép gửi transaction cho lô này không.
 *
 * Chỉ `planned`. Đã `submitting` mà gửi lại nghĩa là trả tiền hai lần; `unknown` mà gửi
 * lại là vi phạm B6 (blocklist revert trên Arc tiêu gas mà không sinh receipt — gửi lại
 * là mất tiền hai lần cho cùng một người).
 */
export function canSubmit(state: string): boolean {
  return state === 'planned';
}

/**
 * Có được phép đọc receipt không.
 *
 * Đọc chain **không** phải gửi tiền, nên `unknown` được phép đọc: đó là cách duy nhất
 * để một lô `unknown` thoát khỏi trạng thái đó mà không auto-retry. `planned` thì không
 * có gì để đọc.
 */
export function canConfirm(state: string): boolean {
  return state === 'submitting' || state === 'unknown';
}

export interface SettlementTally {
  readonly confirmedCount: number;
  readonly submittedCount: number;
  readonly failedCount: number;
  readonly unknownCount: number;
}

/**
 * Trạng thái tổng của lô, suy từ trạng thái từng payout.
 *
 * Vì sao không đặt trạng thái lô bằng tay: một lô 200 người mà 199 người nhận tiền thì
 * gọi là "confirmed" là nói dối; gọi là "failed" thì cũng nói dối. Số đếm mới là thứ
 * đúng, và trạng thái phải suy ra từ đó.
 *
 * `unknown` thắng tất cả: khi còn payout chưa biết kết quả, không được tuyên bố gì khác.
 */
export function settleBatchState(tally: SettlementTally): 'submitting' | 'confirmed' | 'partial' | 'failed' | 'unknown' {
  if (tally.unknownCount > 0) return 'unknown';
  if (tally.submittedCount > 0) return 'submitting';
  if (tally.failedCount === 0) return 'confirmed';
  if (tally.confirmedCount === 0) return 'failed';
  return 'partial';
}
