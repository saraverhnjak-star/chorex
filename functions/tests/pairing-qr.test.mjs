import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash, createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const {
  executeCreatePairingSession: create,
} = require('../lib/createPairingSession.js');
const {
  executeRedeemPairingSession: redeem,
} = require('../lib/redeemPairingSession.js');
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const secret = 'test-only-pairing-secret';
const sha = (value) => createHash('sha256').update(value).digest('hex');

test(
  'QR and numeric pairing security against the Firestore emulator',
  { skip: !enabled },
  async () => {
    assert.match(
      process.env.FIRESTORE_EMULATOR_HOST,
      /^(localhost|127\.0\.0\.1):\d+$/,
    );
    const db = getFirestore(
      initializeApp({ projectId: 'chorex-dev' }, `pairing-${randomUUID()}`),
    );
    const id = randomUUID();
    const familyId = `pairing-test-${id}`,
      parent = `parent-${id}`,
      child = `child-${id}`;
    await db
      .doc(`families/${familyId}/members/${parent}`)
      .set({ role: 'PARENT', status: 'ACTIVE' });
    await db
      .doc(`families/${familyId}/members/${child}`)
      .set({ role: 'CHILD', status: 'ACTIVE' });
    const auth = { createCustomToken: async () => 'test-custom-token' };
    const make = () =>
      create(
        db,
        parent,
        { familyId, childUid: child, idempotencyKey: randomUUID() },
        secret,
      );
    const redeemCredential = (
      token,
      key = randomUUID(),
      source = randomUUID(),
    ) => redeem(db, auth, sha(source), { token, idempotencyKey: key }, secret);
    const denied = async (work, code) =>
      assert.rejects(work, (error) => error.code === code);
    try {
      await denied(
        () =>
          create(
            db,
            child,
            { familyId, childUid: child, idempotencyKey: randomUUID() },
            secret,
          ),
        'WRONG_ACTOR_ROLE',
      );
      await denied(
        () =>
          create(
            db,
            parent,
            {
              familyId: 'another-family',
              childUid: child,
              idempotencyKey: randomUUID(),
            },
            secret,
          ),
        'FAMILY_MEMBERSHIP_REQUIRED',
      );
      const creationKey = randomUUID();
      const first = await create(
        db,
        parent,
        { familyId, childUid: child, idempotencyKey: creationKey },
        secret,
      );
      const creationRetry = await create(
        db,
        parent,
        { familyId, childUid: child, idempotencyKey: creationKey },
        secret,
      );
      assert.equal(creationRetry.sessionId, first.sessionId);
      assert.ok(!('token' in creationRetry) && !('code' in creationRetry));
      assert.match(first.token, /^[A-Za-z0-9_-]{22}$/);
      assert.match(first.code, /^\d{6}$/);
      const stored = (
        await db.doc(`pairingSessions/${first.sessionId}`).get()
      ).data();
      assert.equal(
        stored.expiresAt.toMillis() - stored.createdAt.toMillis(),
        600000,
      );
      assert.equal(stored.tokenHash, sha(first.token));
      assert.ok(stored.codeHash && stored.codeHash !== sha(first.code));
      assert.ok(!JSON.stringify(stored).includes(first.token));
      assert.ok(!('code' in stored) && !('token' in stored));
      const key = randomUUID();
      await redeemCredential(first.token, key);
      await redeemCredential(first.token, key);
      await denied(
        () => redeemCredential(first.code, key),
        'PAIRING_ALREADY_USED',
      );
      await denied(() => redeemCredential(first.token), 'PAIRING_ALREADY_USED');
      const numeric = await make();
      const numericKey = randomUUID();
      await redeemCredential(numeric.code, numericKey);
      await redeemCredential(numeric.code, numericKey);
      await denied(
        () => redeemCredential(numeric.token, numericKey),
        'PAIRING_ALREADY_USED',
      );
      const expiring = await make();
      await db
        .doc(`pairingSessions/${expiring.sessionId}`)
        .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
      await denied(() => redeemCredential(expiring.code), 'PAIRING_EXPIRED');
      const old = await make();
      await make();
      await denied(() => redeemCredential(old.token), 'PAIRING_INVALIDATED');
      // Clear the global limiter only in this isolated local verification.
      await db.doc('pairingRateLimits/numeric_global').delete();
      let wrongCode = '000000';
      while (
        !(
          await db
            .collection('pairingSessions')
            .where(
              'codeHash',
              '==',
              createHmac('sha256', secret)
                .update(`pairing-code:${wrongCode}`)
                .digest('hex'),
            )
            .get()
        ).empty
      )
        wrongCode = (Number(wrongCode) + 1).toString().padStart(6, '0');
      const source = randomUUID();
      for (let i = 0; i < 3; i++)
        await denied(
          () => redeemCredential(wrongCode, randomUUID(), source),
          'PAIRING_INVALID',
        );
      await denied(
        () => redeemCredential('123456', randomUUID(), source),
        'PAIRING_RATE_LIMITED',
      );
      await denied(() => redeemCredential('12'), 'PAIRING_INVALID');
      await denied(() => redeemCredential('12'), 'PAIRING_INVALID');
      await denied(() => redeemCredential('12'), 'PAIRING_RATE_LIMITED');
      await db
        .doc('pairingRateLimits/numeric_global')
        .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
      await denied(() => redeemCredential('12'), 'PAIRING_INVALID');
      const qrIndependent = await make();
      await redeemCredential(qrIndependent.token);
      const capped = await make();
      await db
        .doc(`pairingSessions/${capped.sessionId}`)
        .update({ attemptCount: 3 });
      await denied(() => redeemCredential(capped.code), 'PAIRING_RATE_LIMITED');
      const concurrent = await make();
      await db.doc('pairingRateLimits/numeric_global').delete();
      const result = await Promise.allSettled([
        redeemCredential(concurrent.token),
        redeemCredential(concurrent.code),
      ]);
      assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(result.filter((r) => r.status === 'rejected').length, 1);
    } finally {
      for (const collection of [
        'pairingSessions',
        'activityEvents',
        'idempotency',
      ]) {
        const records = await db
          .collection(collection)
          .where('familyId', '==', familyId)
          .get();
        await Promise.all(records.docs.map((doc) => doc.ref.delete()));
      }
      await db.recursiveDelete(db.doc(`families/${familyId}`));
    }
  },
);
