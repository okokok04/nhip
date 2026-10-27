import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Database } from '../../../packages/db/src/client.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { createApp } from './app.ts';
import { hashApiKey } from './auth.ts';

const API_KEY = 'nhip_sk_receipts_0123456789';
const PLATFORM = 'plat_receipts';

const TOKEN_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const TOKEN_B = 'b2c3d4e5f60718293a4b5c6d7e8f9012345678ab';

let db: Database;
let app: ReturnType<typeof createApp>;
let platformId: string;
let workerA: string;
let workerB: string;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
    PLATFORM,
    'Nền tảng biên nhận',
    hashApiKey(API_KEY),
  ]);
  platformId = PLATFORM;

  for (const [id, externalId, token] of [
    ['wrk_a', 'recv-a', TOKEN_A],
    ['wrk_b', 'recv-b', TOKEN_B],
  ] as const) {
    await db.query(
      `INSERT INTO workers (id, platform_id, external_id, display_name, address, claim_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, platformId, externalId, `Người ${externalId}`, '0x1234567890abcdef1234567890abcdef12345678', token],
    );
  }
  workerA = 'wrk_a';
  workerB = 'wrk_b';
  app = createApp({ db });
});

after(async () => {
  await db.close();
});

async function publicGet(path: string): Promise<Response> {
  // Không Authorization header: đây chính là điểm của endpoint này.
  return await app.request(path);
}

describe('GET /v1/receipts/:claimToken', () => {
  it('mở được mà KHÔNG cần API key', async () => {
    const res = await publicGet(`/v1/receipts/${TOKEN_A}`);
    assert.equal(res.status, 200, 'người lao động không có API key vẫn phải xem được');
  });

  it('chỉ trả payout của đúng người sở hữu token', async () => {
    // Hai lô: một của A đã trả thật, một của B còn chờ.
    await db.query(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          idempotency_key, settlement_mode)
       VALUES ('bat_recv_a', $1, 'confirmed', 1, '5000000', '75000', 'idem_bat_a', 'onchain')`,
      [platformId],
    );
    await db.query(
      `INSERT INTO payouts
         (id, platform_id, worker_id, batch_id, amount_micro, idempotency_key, state, tx_hash, confirmed_at)
       VALUES ('pay_recv_a', $1, $2, 'bat_recv_a', '5000000', 'idem_pay_a', 'confirmed', $3, now())`,
      [platformId, workerA, `0x${'ef'.repeat(32)}`],
    );
    await db.query(
      `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, state)
       VALUES ('pay_recv_b', $1, $2, '7777777', 'idem_pay_b', 'queued')`,
      [platformId, workerB],
    );

    const res = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const body = (await res.json()) as {
      worker: { displayName: string; hasWallet: boolean; address?: string };
      totals: { paid_micro: string; pending_micro: string; count: number };
      receipts: { id: string; state: string; txHash: string | null }[];
    };

    assert.equal(body.worker.displayName, 'Người recv-a');
    assert.equal(body.worker.hasWallet, true);
    // Địa chỉ ví **không** được trả: link bị lộ không được biến thành bản đồ ví.
    assert.equal(body.worker.address, undefined);
    assert.equal(body.receipts.length, 1, 'không được thấy payout của người khác');
    assert.equal(body.receipts[0]?.id, 'pay_recv_a');
    assert.equal(body.receipts[0]?.state, 'paid');
    assert.equal(body.totals.paid_micro, '5000000');
    assert.equal(body.totals.pending_micro, '0');
  });

  it('khoản đã xác nhận trên chain có txHash; khoản chờ thì không', async () => {
    const res = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const body = (await res.json()) as { receipts: { txHash: string | null; paid_at: string | null }[] };
    assert.ok(body.receipts[0]?.txHash, 'payout đã confirmed trên lô onchain phải có hash');
    assert.ok(body.receipts[0]?.paid_at, 'phải có thời điểm trả');
  });

  it('receipt mang theo MẠNG của giao dịch, không để client đoán', async () => {
    // Lô bat_recv_a chưa khai `arc_network` → phải rơi về testnet, không rơi về null.
    const testnetRes = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const testnetBody = (await testnetRes.json()) as { receipts: { network: string | null }[] };
    assert.equal(testnetBody.receipts.find((r) => r.network !== null)?.network, 'testnet');

    await db.query(`UPDATE batches SET arc_network = 'mainnet' WHERE id = 'bat_recv_a'`);
    const mainnetRes = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const mainnetBody = (await mainnetRes.json()) as { receipts: { id: string; network: string | null }[] };
    const mainnet = mainnetBody.receipts.find((r) => r.id === 'pay_recv_a');
    assert.equal(mainnet?.network, 'mainnet', 'link explorer phải trỏ đúng mạng của giao dịch');

    await db.query(`UPDATE batches SET arc_network = NULL WHERE id = 'bat_recv_a'`);
  });

  it('route public KHÔNG trả claim_token (nếu trả, token thành thứ để dò)', async () => {
    const res = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const raw = await res.text();
    assert.ok(!raw.includes(TOKEN_A), 'biên nhận không được chứa lại chính token đã dùng');
    assert.ok(!raw.includes(TOKEN_B), 'không được lộ token của người khác');
  });

  it('lô demo KHÔNG được hiện tx hash cho người lao động', async () => {
    await db.query(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          idempotency_key, settlement_mode)
       VALUES ('bat_recv_demo', $1, 'confirmed', 1, '1234000', '75000', 'idem_bat_demo', 'simulated')`,
      [platformId],
    );
    await db.query(
      `INSERT INTO payouts
         (id, platform_id, worker_id, batch_id, amount_micro, idempotency_key, state)
       VALUES ('pay_recv_demo', $1, $2, 'bat_recv_demo', '1234000', 'idem_pay_demo', 'confirmed')`,
      [platformId, workerA],
    );

    const res = await publicGet(`/v1/receipts/${TOKEN_A}`);
    const body = (await res.json()) as { receipts: { id: string; txHash: string | null; isDemo: boolean }[] };
    const demo = body.receipts.find((item) => item.id === 'pay_recv_demo');

    assert.ok(demo, 'phải thấy khoản demo');
    assert.equal(demo.txHash, null, 'dữ liệu demo không bao giờ được mang hash');
    assert.equal(demo.isDemo, true, 'phải nói rõ đây là dữ liệu demo');
  });

  it('token không tồn tại → 404, cùng message với token sai định dạng', async () => {
    const wrong = await publicGet(`/v1/receipts/${'f'.repeat(40)}`);
    assert.equal(wrong.status, 404);
    const body = (await wrong.json()) as { error: { message: string } };
    assert.equal(body.error.message, 'Không tìm thấy biên nhận.');

    const garbage = await publicGet('/v1/receipts/abc');
    assert.equal(garbage.status, 404);
    const garbageBody = (await garbage.json()) as { error: { message: string } };
    // Cùng message: phân biệt hai trường hợp là tặng thông tin cho người dò token.
    assert.equal(garbageBody.error.message, body.error.message);
  });

  it('token của người khác không mở được dữ liệu của người thứ nhất', async () => {
    const res = await publicGet(`/v1/receipts/${TOKEN_B}`);
    const body = (await res.json()) as { receipts: { id: string }[] };
    assert.ok(
      body.receipts.every((item) => item.id === 'pay_recv_b'),
      'token B chỉ thấy payout của B',
    );
  });

  it('tổng pending tính cả queued và batched', async () => {
    const res = await publicGet(`/v1/receipts/${TOKEN_B}`);
    const body = (await res.json()) as { totals: { pending_micro: string; paid_micro: string } };
    assert.equal(body.totals.pending_micro, '7777777');
    assert.equal(body.totals.paid_micro, '0');
  });
});
