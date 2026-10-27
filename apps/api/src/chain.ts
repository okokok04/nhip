/**
 * Cổng ra Arc — nơi duy nhất trong hệ thống được phép nói chuyện với chain.
 *
 * Vì sao tách thành interface `ChainGateway` thay vì gọi viem rải rác trong route:
 *
 * 1. Route phải test được mà không cần mạng, không cần key, không cần tiền thật.
 *    Một hàm `submit()` chỉ chứng minh được khi chạy với chain giả.
 * 2. Mọi con số (gas, phí, decimals) đi qua **một** chỗ. Nếu `decimals = 18` lọt vào
 *    một file khác, sai 10^12 lần và không ai thấy.
 * 3. Khi cần đổi sang mainnet, chỉ đổi cấu hình ở đây — không phải sửa route.
 *
 * Hai điều về Arc mà file này phải nhớ, cả hai đều đã đo thật:
 *
 * - USDC ERC-20 là `0x3600…0000`, **6 decimals**. Native USDC (gas) là 18 decimals.
 *   Trộn hai bên là sai 10^12 lần.
 * - Mỗi lần transfer USDC phát ra **hai** log `Transfer`: một từ system emitter
 *   `0xffff…fffe` (18 decimals) và một từ `0x3600…0000` (6 decimals). Ai đếm log mà
 *   không lọc theo địa chỉ contract sẽ đếm gấp đôi số tiền.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address as ViemAddress,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arc, arcTestnet } from 'viem/chains';

import type { Address } from '../../../packages/core/src/address.ts';
import { type Micro, micro } from '../../../packages/core/src/money.ts';
import { MIN_MAX_FEE_PER_GAS } from './gas.ts';

/** USDC ERC-20 trên Arc. Địa chỉ giống nhau ở testnet và mainnet. */
export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000';

/**
 * Gas mỗi `transfer` khi *gửi* (không phải khi báo giá).
 *
 * Báo giá có thể gọi `eth_estimateGas` vì nó không tốn tiền. Khi gửi thì mỗi lần gọi
 * thêm là một round trip nhân với số payout, nên dùng hằng số: 75.000 là cận trên của
 * trường hợp lạnh (đo được 74.826). Gas không dùng được hoàn lại, nên đặt cao không
 * làm mất tiền — đặt thấp thì transaction revert vì out of gas.
 */
export const TRANSFER_GAS_LIMIT = 75_000n;

export const USDC_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

/** Topic0 của `Transfer(address,address,uint256)`. */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export type ArcNetwork = 'testnet' | 'mainnet';

/** Phí của mạng tại thời điểm báo giá. Đơn vị wei, chuỗi số nguyên khi ra JSON. */
export interface NetworkFees {
  readonly gasPriceWei: bigint;
  readonly baseFeeWei: bigint | null;
  /**
   * `maxFeePerGas` thực dùng: **cao hơn** cả giá thị trường và sàn 20 Gwei.
   *
   * Không dùng `gasPrice` trần: nếu block kế tiếp có base fee nhích lên, tx dưới sàn
   * sẽ treo vô hạn thay vì fail (B4).
   */
  readonly maxFeePerGasWei: bigint;
}

/** Kết quả đọc receipt. `pending` khác `reverted` — và không được gộp hai thứ đó. */
export type ReceiptOutcome =
  | { readonly status: 'pending' }
  | {
      readonly status: 'success';
      readonly blockNumber: bigint;
      readonly gasUsed: bigint;
      /** Tổng USDC thực nhận theo log của contract USDC. 0 nếu không có log khớp. */
      readonly receivedMicro: Micro;
    }
  | {
      readonly status: 'reverted';
      readonly blockNumber: bigint;
      readonly gasUsed: bigint;
      readonly reason: string;
    };

export interface SendResult {
  readonly txHash: Hex;
  readonly nonce: number;
}

export interface ChainGateway {
  readonly network: ArcNetwork;
  readonly chainId: number;
  /** Địa chỉ ví trả tiền. Không bao giờ là khoá riêng — khoá không rời khỏi process. */
  readonly relayerAddress: Address;
  readonly usdcAddress: Address;

  /** `eth_estimateGas` thật cho một transfer tới `to`. */
  estimateTransferGas(to: Address): Promise<bigint>;

  getFees(): Promise<NetworkFees>;

  /** Số dư **USDC ERC-20** (6 decimals) của một địa chỉ. */
  usdcBalanceOf(address: Address): Promise<Micro>;

  /** Chỉ broadcast, **không** chờ receipt. Nonce do caller cấp để gửi tuần tự. */
  sendUsdcTransfer(input: { to: Address; amountMicro: Micro; nonce: number; maxFeePerGasWei: bigint }): Promise<SendResult>;

  /** Nonce kế tiếp theo trạng thái `pending` của relayer. */
  getNextNonce(): Promise<number>;

  getReceipt(txHash: Hex): Promise<ReceiptOutcome>;
}

export interface ChainConfig {
  readonly network: ArcNetwork;
  readonly rpcUrl: string;
  readonly relayerPrivateKey: Hex;
}

/**
 * Đọc cấu hình từ môi trường.
 *
 * Trả `null` khi thiếu khoá thay vì tự bịa khoá: một hệ thống tự nhận là "đã gửi" khi
 * thật ra không gửi là lỗi tệ nhất mà sản phẩm này có thể mắc. Thiếu khoá nghĩa là
 * chỉ chạy được ở chế độ demo, và API phải nói đúng như vậy.
 */
export function readChainConfig(env: Record<string, string | undefined>): ChainConfig | null {
  const rawKey = env.RELAYER_PRIVATE_KEY?.trim();
  if (!rawKey) return null;

  const key = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('RELAYER_PRIVATE_KEY phải là 32 byte hex (64 ký tự, có hoặc không có 0x).');
  }

  const network: ArcNetwork = env.ARC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  const rpcUrl = env.ARC_RPC_URL?.trim() || (network === 'mainnet' ? 'https://rpc.arc.io' : 'https://rpc.testnet.arc.io');

  return { network, rpcUrl, relayerPrivateKey: key };
}

export function createChainGateway(config: ChainConfig): ChainGateway {
  const chain = config.network === 'mainnet' ? arc : arcTestnet;
  const account = privateKeyToAccount(config.relayerPrivateKey);

  const transport = http(config.rpcUrl, { timeout: 20_000, retryCount: 2 });
  const publicClient: PublicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  const relayerAddress = account.address.toLowerCase() as Address;

  return {
    network: config.network,
    chainId: chain.id,
    relayerAddress,
    usdcAddress: USDC_ADDRESS,

    async estimateTransferGas(to) {
      return await publicClient.estimateContractGas({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [to as ViemAddress, 1_000_000n],
        account,
      });
    },

    async getFees() {
      const [gasPriceWei, block] = await Promise.all([
        publicClient.getGasPrice(),
        publicClient.getBlock(),
      ]);
      const baseFeeWei = block.baseFeePerGas ?? null;

      // Sàn và giá thị trường đều phải được tôn trọng: `max` của hai, cộng thêm 25%
      // đệm để block kế tiếp có nhích base fee cũng không treo tx.
      const market = gasPriceWei + gasPriceWei / 4n;
      const maxFeePerGasWei = market > MIN_MAX_FEE_PER_GAS ? market : MIN_MAX_FEE_PER_GAS;

      return { gasPriceWei, baseFeeWei, maxFeePerGasWei };
    },

    async usdcBalanceOf(address) {
      const value = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address as ViemAddress],
      });
      return micro(value);
    },

    async getNextNonce() {
      return await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
    },

    async sendUsdcTransfer(input) {
      const txHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [input.to as ViemAddress, input.amountMicro],
        // Nonce do caller cấp: gửi N transaction liên tiếp mà để thư viện tự lấy nonce
        // thì cả N lần đọc cùng một `pending count` và N-1 tx đè nonce lên nhau.
        nonce: input.nonce,
        gas: TRANSFER_GAS_LIMIT,
        maxFeePerGas: input.maxFeePerGasWei,
        chain,
        account,
      });
      return { txHash, nonce: input.nonce };
    },

    async getReceipt(txHash) {
      let receipt: TransactionReceipt;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'TransactionReceiptNotFoundError') return { status: 'pending' };
        throw error;
      }

      if (receipt.status !== 'success') {
        return {
          status: 'reverted',
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          reason: 'Transaction revert trên Arc — tiền không rời ví, nhưng gas đã mất.',
        };
      }

      return {
        status: 'success',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        receivedMicro: sumUsdcTransferLogs(receipt, relayerAddress),
      };
    },
  };
}

/**
 * Cộng các log `Transfer` **của contract USDC** trong một receipt.
 *
 * Vì sao phải lọc `log.address`: trên Arc mỗi lần chuyển USDC phát ra hai log, một từ
 * system emitter `0xffff…fffe` dùng 18 decimals và một từ `0x3600…0000` dùng 6. Cộng
 * cả hai là đếm gấp đôi. Vì sao phải lọc topic: một receipt có thể có log của contract
 * khác; chỉ log `Transfer` từ USDC mới là tiền.
 */
export function sumUsdcTransferLogs(receipt: TransactionReceipt, usdc: Address): Micro {
  let total = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdc.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!log.data || log.data === '0x') continue;
    total += BigInt(log.data);
  }
  return micro(total);
}
