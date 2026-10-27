import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Database } from '../../../packages/db/src/client.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { createApp } from './app.ts';
import { hashApiKey } from './auth.ts';
import type { ChainGateway, NetworkFees, ReceiptOutcome, SendResult } from './chain.ts';

const API_KEY = 'nhip_sk_settlement_0123456789';
const PLATFORM = 'plat_settle';

let db: Database;
let app: ReturnType<typeof createApp>;
let appWithoutChain: ReturnType<typeof createApp>;

/**
 * Chain giả: đủ để chứng minh route làm đúng *quyết định*, không để chứng minh viem
 * gọi được mạng. Đây là điều duy nhất test được mà không có tiền thật.
 */
class FakeChain implements ChainGateway {
  readonly network = 'testnet' as const;
  readonly chainId = 5042002;
  readonly relayerAddress = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' as const;
  readonly usdcAddress = '0x3600000000000000000000000000000000000000' as const;

  estimateGas = 74_826n;
  estimateShouldThrow = false;
  balanceMicro = 1_000_000_000n;
  fees: NetworkFees = {
    gasPriceWei: 25_000_000_000n,
    baseFeeWei: 20_000_000_000n,
    maxFeePerGasWei: 31_250_000_000n,
  };

  sendShouldThrowAt: number | null = null;
  nextNonce = 7;
  readonly sent: { to: string; amountMicro: bigint; nonce: number }[] = [];
  receipts = new Map<string, ReceiptOutcome>();
  readonly estimateCalls: string[] = [];

  async estimateTransferGas(to: string): Promise<bigint> {
    this.estimateCalls.push(to);
    if (this.estimateShouldThrow) throw new Error('RPC không phản hồi');
    return this.estimateGas;
  }

  async getFees(): Promise<NetworkFees> {
    return this.fees;
  }

  async usdcBalanceOf(): Promise<Micro> {
    return this.balanceMicro as Micro;
  }

  async getNextNonce(): Promise<number> {
    return this.nextNonce;
  }

  async sendUsdcTransfer(input: {
    to: string;
    amountMicro: bigint;
    nonce: number;
  }): Promise<SendResult> {
    if (this.sendShouldThrowAt !== null && this.sent.length === this.sendShouldThrowAt) {
      throw new Error('nonce đã bị dùng');
    }
    const txHash = `0x${(this.sent.length + 1).toString(16).padStart(64, '0')}` as const;
    this.sent.push({ to: input.to, amountMicro: input.amountMicro, nonce: input.nonce });
    this.receipts.set(txHash, { status: 'pending' });
    return { txHash, nonce: input.nonce };
  }

  async getReceipt(txHash: string): Promise<ReceiptOutcome> {
    return this.receipts.get(txHash) ?? { status: 'pending' };
  }
}

const WORKER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

async function call(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${options.key ?? API_KEY}` };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return await app.request(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

/** Tạo một lô `planned` có `count` payout, tất cả trả cho cùng một người có ví. */
async function makePlannedBatch(count: number, externalId = 'settle-worker'): Promise<string> {
  const workerRes = await call('/v1/workers', {
    method: 'POST',
    body: { externalId, address: WORKER_ADDRESS },
  });
  assert.equal(workerRes.status, 201, 'phải tạo được worker có ví');
  const worker = (await workerRes.json()) as { id: string };

  const payouts = Array.from({ length: count }, (_, index) => ({
    workerId: worker.id,
    amount_micro: String(1_000_000 + index),
  }));

  const withKey = await app.request('/v1/batches', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': `batch-settle-${externalId}-${count}`,
    },
    body: JSON.stringify({ payouts }),
  });
  assert.equal(withKey.status, 202, 'phải tạo được lô');
  const body = (await withKey.json()) as { batches: { id: string }[] };
  const batchId = body.batches[0]?.id;
  assert.ok(batchId, 'phải có ít nhất một lô');
  return batchId;
}

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
    PLATFORM,
    'Nền tảng settlement',
    hashApiKey(API_KEY),
  ]);
  appWithoutChain = createApp({ db, generateRequestId: () => 'req_fixed' });
});

after(async () => {
  await db.close();
});

describe('settlement — chưa cấu hình ví trả tiền', () => {
  it('báo giá bị từ chối với lời giải thích, không giả vờ thành công', async () => {
    const res = await appWithoutChain.request('/v1/settlement/batches/any/quote', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'CHAIN_UNAVAILABLE');
    assert.match(body.error.message, /RELAYER_PRIVATE_KEY/);
  });

  it('/v1/me nói rõ chain chưa cấu hình', async () => {
    const res = await appWithoutChain.request('/v1/me', {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    const body = (await res.json()) as { chain: { configured: boolean } };
    assert.equal(body.chain.configured, false);
  });
});

describe('settlement — có chain', () => {
  let chain: FakeChain;

  before(() => {
    chain = new FakeChain();
    app = createApp({ db, chain, generateRequestId: () => 'req_fixed' });
  });

  it('/v1/me trả về địa chỉ relayer và mạng', async () => {
    const res = await call('/v1/me');
    const body = (await res.json()) as {
      chain: { configured: boolean; network: string; relayerAddress: string };
      isDemo: boolean;
    };
    assert.equal(body.chain.configured, true);
    assert.equal(body.chain.network, 'testnet');
    assert.equal(body.chain.relayerAddress, chain.relayerAddress);
    assert.equal(body.isDemo, false, 'platform không có is_demo = true');
  });

  it('báo giá: đo gas thật, tính phí, và KHÔNG gửi gì lên chain', async () => {
    const batchId = await makePlannedBatch(3, 'quote-worker');
    chain.estimateCalls.length = 0;

    const res = await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      payoutCount: number;
      gas: string;
      gasMeasured: boolean;
      maxFeeWei: string;
      maxFeeMicro: string;
      affordable: boolean;
      relayerAddress: string;
      chainId: number;
      usdcAddress: string;
    };

    assert.equal(body.payoutCount, 3);
    assert.equal(body.gasMeasured, true);
    assert.equal(body.gas, (74_826n * 3n).toString());
    assert.equal(body.maxFeeWei, (74_826n * 3n * 31_250_000_000n).toString());
    assert.equal(body.affordable, true);
    assert.equal(body.chainId, 5042002);
    assert.equal(body.usdcAddress, '0x3600000000000000000000000000000000000000');
    assert.equal(chain.sent.length, 0, 'báo giá không được gửi transaction');
    assert.equal(chain.estimateCalls.length, 1, 'đo gas một lần, không đo từng payout');
  });

  it('báo giá nói rõ thiếu bao nhiêu khi ví không đủ', async () => {
    const batchId = await makePlannedBatch(2, 'poor-relayer');
    chain.balanceMicro = 0n;

    const res = await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });
    const body = (await res.json()) as { affordable: boolean; shortfallMicro: string };
    assert.equal(body.affordable, false);
    assert.ok(BigInt(body.shortfallMicro) > 0n);

    chain.balanceMicro = 1_000_000_000n;
  });

  it('RPC lỗi khi đo gas vẫn cho báo giá, nhưng đánh dấu là ước lượng', async () => {
    const batchId = await makePlannedBatch(1, 'rpc-down');
    chain.estimateShouldThrow = true;

    const res = await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { gasMeasured: boolean; gasPerTransfer: string };
    assert.equal(body.gasMeasured, false);
    assert.equal(body.gasPerTransfer, '75000', 'dùng cận trên đã đo cho ví lạnh');

    chain.estimateShouldThrow = false;
  });

  it('submit từ chối lô chưa có báo giá', async () => {
    const batchId = await makePlannedBatch(1, 'no-quote');

    const res = await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { message: string } };
    assert.match(body.error.message, /chưa có báo giá/);
  });

  it('submit gửi tuần tự với nonce tăng, ghi tx_hash, trả 202 (B5)', async () => {
    const batchId = await makePlannedBatch(3, 'submit-ok');
    await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });

    chain.sent.length = 0;
    chain.nextNonce = 42;

    const res = await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });
    assert.equal(res.status, 202, 'không chờ chain');

    const body = (await res.json()) as {
      sentCount: number;
      state: string;
      transactions: { payoutId: string; txHash: string }[];
    };
    assert.equal(body.sentCount, 3);
    assert.equal(body.transactions.length, 3);

    // Nonce phải tăng dần: hai tx cùng nonce thì cái sau đè cái trước.
    assert.deepEqual(
      chain.sent.map((tx) => tx.nonce),
      [42, 43, 44],
    );
  });

  it('submit lần hai bị từ chối: lô không còn planned', async () => {
    const batchId = await makePlannedBatch(1, 'submit-twice');
    await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });
    await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });

    const sentBefore = chain.sent.length;
    const second = await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });

    assert.equal(second.status, 400);
    assert.equal(chain.sent.length, sentBefore, 'không được gửi thêm transaction nào');
  });

  it('confirm: receipt success → confirmed, ghi block và gas', async () => {
    const batchId = await makePlannedBatch(2, 'confirm-ok');
    await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });

    chain.sent.length = 0;
    chain.receipts.clear();
    const submitted = await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });
    const { transactions } = (await submitted.json()) as {
      transactions: { txHash: string }[];
    };

    for (const tx of transactions) {
      chain.receipts.set(tx.txHash, {
        status: 'success',
        blockNumber: 1_234_567n,
        gasUsed: 49_338n,
        receivedMicro: 1_000_000n as never,
      });
    }

    const res = await call(`/v1/settlement/batches/${batchId}/confirm`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      state: string;
      tally: { confirmedCount: number; submittedCount: number };
      payouts: { state: string; txHash: string | null; blockNumber: string | null; gasUsed: string | null }[];
    };

    assert.equal(body.state, 'confirmed');
    assert.equal(body.tally.confirmedCount, 2);
    assert.equal(body.tally.submittedCount, 0);
    assert.equal(body.payouts[0]?.blockNumber, '1234567');
    assert.equal(body.payouts[0]?.gasUsed, '49338');
    assert.ok(body.payouts[0]?.txHash, 'payout đã trả phải có hash');
  });

  it('confirm: một tx revert → partial, không phải confirmed', async () => {
    const batchId = await makePlannedBatch(2, 'confirm-partial');
    await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });

    chain.sent.length = 0;
    chain.receipts.clear();
    const submitted = await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });
    const { transactions } = (await submitted.json()) as { transactions: { txHash: string }[] };

    const [first, second] = transactions;
    assert.ok(first && second);
    chain.receipts.set(first.txHash, {
      status: 'success',
      blockNumber: 100n,
      gasUsed: 49_338n,
      receivedMicro: 1_000_000n as never,
    });
    chain.receipts.set(second.txHash, {
      status: 'reverted',
      blockNumber: 101n,
      gasUsed: 30_000n,
      reason: 'ERC20: transfer amount exceeds balance',
    });

    const res = await call(`/v1/settlement/batches/${batchId}/confirm`, { method: 'POST' });
    const body = (await res.json()) as { state: string; tally: { confirmedCount: number; failedCount: number } };

    assert.equal(body.state, 'partial');
    assert.equal(body.tally.confirmedCount, 1);
    assert.equal(body.tally.failedCount, 1);

    const batch = await db.query<{ state: string; error: string | null }>(
      'SELECT state, error FROM batches WHERE id = $1',
      [batchId],
    );
    assert.equal(batch.rows[0]?.state, 'partial');
    assert.match(batch.rows[0]?.error ?? '', /1 payout revert/);
  });

  it('confirm: receipt chưa có → giữ nguyên state, không đánh dấu thất bại', async () => {
    const batchId = await makePlannedBatch(1, 'confirm-pending');
    await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });

    chain.sent.length = 0;
    chain.receipts.clear();
    await call(`/v1/settlement/batches/${batchId}/submit`, { method: 'POST' });

    // Không set receipt: mô phỏng tx còn trong mempool.
    const res = await call(`/v1/settlement/batches/${batchId}/confirm`, { method: 'POST' });
    const body = (await res.json()) as { state: string; tally: { submittedCount: number } };

    // Transaction chưa có receipt KHÔNG phải thất bại. Ghi failed ở đây là tự tạo ra một
    // lần trả lại tiền cho cùng một người.
    assert.equal(body.state, 'submitting');
    assert.equal(body.tally.submittedCount, 1);
  });

  it('GET trạng thái settlement không đụng chain', async () => {
    const batchId = await makePlannedBatch(1, 'read-state');
    const res = await call(`/v1/settlement/batches/${batchId}`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      state: string;
      canSubmit: boolean;
      chainConfigured: boolean;
      settlementMode: string;
      payouts: unknown[];
    };
    assert.equal(body.state, 'planned');
    assert.equal(body.canSubmit, true);
    assert.equal(body.chainConfigured, true);
    assert.equal(body.settlementMode, 'unsettled');
    assert.equal(body.payouts.length, 1);
  });

  it('lô không tồn tại → 404 chứ không 500', async () => {
    const res = await call('/v1/settlement/batches/bat_khong_ton_tai/quote', { method: 'POST' });
    assert.equal(res.status, 404);
  });

  it('lô có payout không địa chỉ ví → báo giá từ chối và nêu số người thiếu ví', async () => {
    const workerRes = await call('/v1/workers', {
      method: 'POST',
      body: { externalId: 'no-wallet-worker' },
    });
    const worker = (await workerRes.json()) as { id: string };

    const created = await app.request('/v1/batches', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': 'batch-no-wallet',
      },
      body: JSON.stringify({ payouts: [{ workerId: worker.id, amount_micro: '500000' }] }),
    });
    const { batches } = (await created.json()) as { batches: { id: string }[] };
    const batchId = batches[0]?.id;
    assert.ok(batchId);

    const res = await call(`/v1/settlement/batches/${batchId}/quote`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { message: string; details?: { unpayable?: string[] } } };
    assert.match(body.error.message, /chưa liên kết ví/);
    assert.equal(body.error.details?.unpayable?.length, 1);
  });
});
