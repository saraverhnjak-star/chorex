import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Timestamp } = require('firebase-admin/firestore');
const {
  executeRecordTaskCompletion,
  RecordTaskCompletionCommandError,
} = require('../lib/recordTaskCompletion.js');
const {
  recordTaskCompletionInputSchema,
  recordTaskCompletionOutputSchema,
  taskCompletionSchema,
} = require('@chorex/domain');

function clone(value) {
  if (value instanceof Timestamp || value === null || typeof value !== 'object')
    return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, clone(nested)]),
  );
}
function fixture(targetCount = 3) {
  const now = Timestamp.now();
  const documents = new Map([
    [
      'contracts/contract',
      {
        familyId: 'family',
        parentUid: 'parent',
        childUid: 'child',
        participantUids: ['parent', 'child'],
        status: 'ACTIVE',
        source: { type: 'OFFER', offerId: 'offer', revisionId: 'revision' },
        rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
        deadlineAt: Timestamp.fromMillis(0),
        reviewCycle: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      'contracts/contract/tasks/task',
      {
        familyId: 'family',
        contractId: 'contract',
        assigneeUid: 'child',
        title: 'Dishwasher',
        description: 'After dinner',
        completedCount: 0,
        targetCount,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ['families/family/members/child', { role: 'CHILD', status: 'ACTIVE' }],
    ['families/family/members/parent', { role: 'PARENT', status: 'ACTIVE' }],
    ['families/family/members/sibling', { role: 'CHILD', status: 'ACTIVE' }],
  ]);
  let tail = Promise.resolve();
  const firestore = {
    doc(path) {
      return { path, id: path.split('/').at(-1) };
    },
    collection(path) {
      return { path, collection: true };
    },
    async runTransaction(operation) {
      let unlock;
      const prior = tail;
      tail = new Promise((resolve) => {
        unlock = resolve;
      });
      await prior;
      try {
        const writes = [];
        const result = await operation({
          get: async (ref) =>
            ref.collection
              ? {
                  docs: [...documents]
                    .filter(
                      ([path]) =>
                        path.startsWith(ref.path + '/') &&
                        path.split('/').length ===
                          ref.path.split('/').length + 1,
                    )
                    .map(([path, data]) => ({
                      id: path.split('/').at(-1),
                      data: () => clone(data),
                    })),
                }
              : {
                  exists: documents.has(ref.path),
                  data: () => clone(documents.get(ref.path)),
                },
          create: (ref, data) => {
            assert.equal(documents.has(ref.path), false);
            writes.push([ref.path, clone(data)]);
          },
          update: (ref, data) => {
            assert.equal(documents.has(ref.path), true);
            writes.push([
              ref.path,
              { ...documents.get(ref.path), ...clone(data) },
            ]);
          },
        });
        for (const [path, data] of writes) documents.set(path, data);
        return result;
      } finally {
        unlock();
      }
    },
  };
  return {
    firestore,
    documents,
    task: () => documents.get('contracts/contract/tasks/task'),
    contract: () => documents.get('contracts/contract'),
    completions: () =>
      [...documents].filter(([path]) => path.includes('/completions/')),
    events: () =>
      [...documents].filter(([path]) => path.startsWith('activityEvents/')),
  };
}
const submission = require('../lib/submitContractForReview.js');
const submitInput = {
  contractId: 'contract',
  idempotencyKey: 'submission-key-001',
};
const submit = (f, actor = 'child', input = submitInput) =>
  submission.executeSubmitContractForReview(f.firestore, actor, input);
const input = {
  contractId: 'contract',
  taskId: 'task',
  idempotencyKey: 'completion-key-001',
};
async function expectCode(code, operation) {
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RecordTaskCompletionCommandError && error.code === code,
  );
}

test('strict command input rejects authority fields and malformed IDs/keys; canonical completion output is linked', () => {
  for (const field of [
    'childUid',
    'assigneeUid',
    'familyId',
    'role',
    'completedCount',
    'ordinal',
    'targetCount',
    'status',
    'note',
  ])
    assert.equal(
      recordTaskCompletionInputSchema.safeParse({
        ...input,
        [field]: 'untrusted',
      }).success,
      false,
    );
  for (const patch of [
    { taskId: '../task' },
    { contractId: '' },
    { idempotencyKey: 'short' },
  ])
    assert.equal(
      recordTaskCompletionInputSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
  assert.equal(taskCompletionSchema.safeParse({}).success, false);
});
test('one-time progress, canonical snapshot retry, actor audit and no Contract/reward/review mutations', async () => {
  const f = fixture(1);
  const original = clone(f.contract());
  const first = await executeRecordTaskCompletion(f.firestore, 'child', input);
  assert.equal(first.task.completedCount, 1);
  assert.equal(first.completion.ordinal, 1);
  assert.equal(first.completion.childUid, 'child');
  assert.equal(first.completion.familyId, 'family');
  assert.equal(first.completion.contractId, 'contract');
  assert.equal(first.completion.taskId, 'task');
  assert.equal(recordTaskCompletionOutputSchema.safeParse(first).success, true);
  assert.equal(
    recordTaskCompletionOutputSchema.safeParse({
      ...first,
      completion: { ...first.completion, ordinal: 2 },
    }).success,
    false,
  );
  assert.deepEqual(
    await executeRecordTaskCompletion(f.firestore, 'child', input),
    first,
  );
  assert.equal(f.completions().length, 1);
  assert.equal(f.events().length, 1);
  const event = f.events()[0][1];
  assert.equal(event.actorType, 'CHILD');
  assert.equal(event.actorUid, 'child');
  assert.equal(event.type, 'TASK_COMPLETED');
  assert.equal(event.entityType, 'TASK');
  assert.deepEqual(event.metadata, {
    contractId: 'contract',
    taskId: 'task',
    completionId: first.completion.id,
    ordinal: 1,
  });
  assert.deepEqual(f.contract(), original);
  assert.equal(
    [...f.documents.keys()].some(
      (path) => path.startsWith('rewards/') || path.includes('/reviews/'),
    ),
    false,
  );
  await expectCode('TASK_ALREADY_COMPLETE', () =>
    executeRecordTaskCompletion(f.firestore, 'child', {
      ...input,
      idempotencyKey: 'completion-key-002',
    }),
  );
  assert.equal(f.events().length, 1);
});
test('100 repetitions use sequential ordinals, immutable history and retain the original retry result', async () => {
  const f = fixture(100);
  const first = await executeRecordTaskCompletion(f.firestore, 'child', input);
  const firstRecord = clone(f.completions()[0]);
  for (let ordinal = 2; ordinal <= 100; ordinal++) {
    const result = await executeRecordTaskCompletion(f.firestore, 'child', {
      ...input,
      idempotencyKey: `repeat-completion-${ordinal}`,
    });
    assert.equal(result.task.completedCount, ordinal);
    assert.equal(result.completion.ordinal, ordinal);
  }
  assert.equal(f.task().completedCount, 100);
  assert.equal(f.completions().length, 100);
  assert.equal(f.events().length, 100);
  assert.deepEqual(f.documents.get(firstRecord[0]), firstRecord[1]);
  assert.deepEqual(
    await executeRecordTaskCompletion(f.firestore, 'child', input),
    first,
  );
  assert.equal(f.task().completedCount, 100);
});
for (const [label, actor, prepare, code] of [
  ['unauthenticated', undefined, () => {}, 'AUTH_REQUIRED'],
  ['Parent', 'parent', () => {}, 'WRONG_ACTOR_ROLE'],
  ['same-family sibling', 'sibling', () => {}, 'FORBIDDEN'],
  ['other family', 'outside', () => {}, 'FAMILY_MEMBERSHIP_REQUIRED'],
  [
    'inactive',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').status = 'INACTIVE';
    },
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'disabled',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').status = 'DISABLED';
    },
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'non-member',
    'child',
    (f) => {
      f.documents.delete('families/family/members/child');
    },
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'wrong membership role',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').role = 'PARENT';
    },
    'WRONG_ACTOR_ROLE',
  ],
  [
    'unlisted participant',
    'child',
    (f) => {
      f.contract().participantUids = ['parent', 'sibling'];
    },
    'FORBIDDEN',
  ],
  [
    'wrong assignee',
    'child',
    (f) => {
      f.task().assigneeUid = 'sibling';
    },
    'FORBIDDEN',
  ],
  [
    'task from another Contract',
    'child',
    (f) => {
      f.task().contractId = 'another';
    },
    'FORBIDDEN',
  ],
  [
    'wrong task family',
    'child',
    (f) => {
      f.task().familyId = 'another';
    },
    'FORBIDDEN',
  ],
  [
    'missing Contract',
    'child',
    (f) => {
      f.documents.delete('contracts/contract');
    },
    'CONTRACT_NOT_FOUND',
  ],
  [
    'missing task',
    'child',
    (f) => {
      f.documents.delete('contracts/contract/tasks/task');
    },
    'TASK_NOT_FOUND',
  ],
  [
    'negative counter',
    'child',
    (f) => {
      f.task().completedCount = -1;
    },
    'INVALID_STATE',
  ],
  [
    'over-target counter',
    'child',
    (f) => {
      f.task().completedCount = 4;
    },
    'INVALID_STATE',
  ],
])
  test(`${label} fails without a completion/event/idempotency write`, async () => {
    const f = fixture();
    prepare(f);
    const before = clone([...f.documents]);
    await expectCode(code, () =>
      executeRecordTaskCompletion(f.firestore, actor, input),
    );
    assert.deepEqual([...f.documents], before);
  });
for (const status of [
  'READY_FOR_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'CANCELLED',
  'EXPIRED',
])
  test(`${status} rejects new progress but retains a canonical committed retry`, async () => {
    const f = fixture();
    const first = await executeRecordTaskCompletion(
      f.firestore,
      'child',
      input,
    );
    f.contract().status = status;
    await expectCode('INVALID_STATE', () =>
      executeRecordTaskCompletion(f.firestore, 'child', {
        ...input,
        idempotencyKey: 'nonactive-completion',
      }),
    );
    assert.deepEqual(
      await executeRecordTaskCompletion(f.firestore, 'child', input),
      first,
    );
    assert.equal(f.events().length, 1);
  });
test('same key with different task or Contract conflicts; revoked membership cannot retrieve a retry', async () => {
  const f = fixture();
  await executeRecordTaskCompletion(f.firestore, 'child', input);
  for (const patch of [{ taskId: 'other' }, { contractId: 'other' }])
    await expectCode('IDEMPOTENCY_CONFLICT', () =>
      executeRecordTaskCompletion(f.firestore, 'child', { ...input, ...patch }),
    );
  f.documents.get('families/family/members/child').status = 'DISABLED';
  await expectCode('FAMILY_MEMBERSHIP_REQUIRED', () =>
    executeRecordTaskCompletion(f.firestore, 'child', input),
  );
  assert.equal(f.task().completedCount, 1);
});

async function submissionCode(code, operation) {
  await assert.rejects(
    operation,
    (error) =>
      error instanceof submission.SubmitContractForReviewCommandError &&
      error.code === code,
  );
}
test('submission strict schema rejects client authority and requires canonical READY_FOR_REVIEW output', () => {
  const {
    submitContractForReviewInputSchema: inputSchema,
    submitContractForReviewOutputSchema: outputSchema,
  } = require('@chorex/domain');
  assert.equal(inputSchema.safeParse(submitInput).success, true);
  for (const field of [
    'role',
    'familyId',
    'childUid',
    'allTasksComplete',
    'reviewCycle',
    'status',
  ])
    assert.equal(
      inputSchema.safeParse({ ...submitInput, [field]: true }).success,
      false,
    );
  for (const patch of [{ contractId: '../bad' }, { idempotencyKey: 'short' }])
    assert.equal(
      inputSchema.safeParse({ ...submitInput, ...patch }).success,
      false,
    );
  assert.equal(
    outputSchema.safeParse({ contract: { status: 'ACTIVE' } }).success,
    false,
  );
});
test('complete submission preserves terms, tasks and immutable history, passed deadline and cycle; canonical retry audits once', async () => {
  const f = fixture(1);
  await executeRecordTaskCompletion(f.firestore, 'child', input);
  const original = clone(f.contract()),
    task = clone(f.task()),
    history = clone(f.completions());
  const first = await submit(f);
  assert.equal(first.contract.status, 'READY_FOR_REVIEW');
  assert.equal(first.contract.reviewCycle, 0);
  assert.deepEqual(f.contract(), {
    ...original,
    status: 'READY_FOR_REVIEW',
    updatedAt: f.contract().updatedAt,
  });
  assert.deepEqual(f.task(), task);
  assert.deepEqual(f.completions(), history);
  assert.deepEqual(await submit(f), first);
  assert.equal(f.events().length, 2);
  const event = f
    .events()
    .find(([, event]) => event.type === 'CONTRACT_SUBMITTED')[1];
  assert.equal(event.actorUid, 'child');
  assert.equal(event.actorType, 'CHILD');
  assert.equal(event.entityType, 'CONTRACT');
  assert.equal(event.entityId, 'contract');
  assert.equal(
    [...f.documents.keys()].some(
      (path) => path.startsWith('rewards/') || path.includes('/reviews/'),
    ),
    false,
  );
  await submissionCode('INVALID_STATE', () =>
    submit(f, 'child', { ...submitInput, idempotencyKey: 'submission-second' }),
  );
  await submissionCode('IDEMPOTENCY_CONFLICT', () =>
    submit(f, 'child', { ...submitInput, contractId: 'other' }),
  );
  f.contract().status = 'APPROVED';
  assert.deepEqual(await submit(f), first);
  f.documents.get('families/family/members/child').status = 'DISABLED';
  await submissionCode('FAMILY_MEMBERSHIP_REQUIRED', () => submit(f));
});
for (const [label, actor, prepare, code] of [
  ['unauthenticated', undefined, () => {}, 'AUTH_REQUIRED'],
  ['Parent', 'parent', () => {}, 'WRONG_ACTOR_ROLE'],
  ['sibling', 'sibling', () => {}, 'FORBIDDEN'],
  ['other family', 'outside', () => {}, 'FAMILY_MEMBERSHIP_REQUIRED'],
  [
    'inactive',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').status = 'INACTIVE';
    },
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'disabled',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').status = 'DISABLED';
    },
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'nonmember',
    'child',
    (f) => f.documents.delete('families/family/members/child'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'wrong role',
    'child',
    (f) => {
      f.documents.get('families/family/members/child').role = 'OTHER';
    },
    'WRONG_ACTOR_ROLE',
  ],
  [
    'unlisted participant',
    'child',
    (f) => {
      f.contract().participantUids = ['parent'];
    },
    'FORBIDDEN',
  ],
  [
    'missing Contract',
    'child',
    (f) => f.documents.delete('contracts/contract'),
    'CONTRACT_NOT_FOUND',
  ],
  [
    'one incomplete',
    'child',
    (f) => {
      f.task().completedCount = 0;
    },
    'TASKS_INCOMPLETE',
  ],
  [
    'multiple one incomplete',
    'child',
    (f) =>
      f.documents.set('contracts/contract/tasks/second', {
        ...f.task(),
        completedCount: 0,
      }),
    'TASKS_INCOMPLETE',
  ],
  [
    'partial 100',
    'child',
    (f) => {
      f.task().targetCount = 100;
      f.task().completedCount = 99;
    },
    'TASKS_INCOMPLETE',
  ],
  [
    'zero tasks',
    'child',
    (f) => f.documents.delete('contracts/contract/tasks/task'),
    'INVALID_STATE',
  ],
  [
    'over target',
    'child',
    (f) => {
      f.task().completedCount = 2;
    },
    'INVALID_STATE',
  ],
  [
    'negative counter',
    'child',
    (f) => {
      f.task().completedCount = -1;
    },
    'INVALID_STATE',
  ],
  [
    'wrong task family',
    'child',
    (f) => {
      f.task().familyId = 'other';
    },
    'FORBIDDEN',
  ],
  [
    'wrong task Contract',
    'child',
    (f) => {
      f.task().contractId = 'other';
    },
    'FORBIDDEN',
  ],
  [
    'wrong assignee',
    'child',
    (f) => {
      f.task().assigneeUid = 'other';
    },
    'FORBIDDEN',
  ],
])
  test(`submission ${label} fails atomically`, async () => {
    const f = fixture(1);
    f.task().completedCount = 1;
    prepare(f);
    const before = clone([...f.documents]);
    await submissionCode(code, () =>
      submission.executeSubmitContractForReview(
        f.firestore,
        actor,
        submitInput,
      ),
    );
    assert.deepEqual([...f.documents], before);
  });
for (const status of [
  'READY_FOR_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'CANCELLED',
  'EXPIRED',
])
  test(`submission rejects ${status}`, async () => {
    const f = fixture(1);
    f.task().completedCount = 1;
    f.contract().status = status;
    await submissionCode('INVALID_STATE', () => submit(f));
    assert.equal(f.events().length, 0);
  });
test('same-key submissions converge; different keys serialize to one legal transition', async () => {
  for (const sameKey of [true, false]) {
    const f = fixture(1);
    await executeRecordTaskCompletion(f.firestore, 'child', input);
    const results = await Promise.allSettled([
      submit(f),
      submit(f, 'child', {
        ...submitInput,
        idempotencyKey: sameKey
          ? submitInput.idempotencyKey
          : 'submission-competing',
      }),
    ]);
    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length,
      sameKey ? 2 : 1,
    );
    if (sameKey) assert.deepEqual(results[0].value, results[1].value);
    else
      assert.equal(
        results.find((r) => r.status === 'rejected').reason.code,
        'INVALID_STATE',
      );
    assert.equal(
      f.events().filter(([, event]) => event.type === 'CONTRACT_SUBMITTED')
        .length,
      1,
    );
    assert.equal(f.contract().status, 'READY_FOR_REVIEW');
  }
});
test('final completion and submission observe committed counters in either ordering', async () => {
  for (const completionFirst of [true, false]) {
    const f = fixture(1);
    const complete = () =>
      executeRecordTaskCompletion(f.firestore, 'child', input);
    const requests = completionFirst
      ? [complete(), submit(f)]
      : [submit(f), complete()];
    const results = await Promise.allSettled(requests);
    if (!completionFirst) {
      assert.equal(results[0].reason.code, 'TASKS_INCOMPLETE');
      await submit(f);
    }
    assert.equal(f.contract().status, 'READY_FOR_REVIEW');
    assert.equal(f.completions().length, 1);
    assert.equal(f.events().length, 2);
    await expectCode('INVALID_STATE', () =>
      executeRecordTaskCompletion(f.firestore, 'child', {
        ...input,
        idempotencyKey: 'after-submission',
      }),
    );
  }
});

test('submission preserves an existing reviewCycle without choosing numbering semantics', async () => {
  const f = fixture(1);
  f.task().completedCount = 1;
  f.contract().reviewCycle = 7;
  assert.equal((await submit(f)).contract.reviewCycle, 7);
  assert.equal(f.contract().reviewCycle, 7);
  await submissionCode('INVALID_INPUT', () =>
    submit(f, 'child', { ...submitInput, role: 'CHILD' }),
  );
  const { submitContractForReviewOutputSchema } = require('@chorex/domain');
  const receipt = await submit(f);
  assert.equal(
    submitContractForReviewOutputSchema.safeParse({
      contract: { ...receipt.contract, status: 'ACTIVE' },
    }).success,
    false,
  );
});

const approval = require('../lib/approveContract.js');
const approvalInput = {
  contractId: 'contract',
  idempotencyKey: 'approval-key-001',
};
const approve = (f, actor = 'parent', value = approvalInput) =>
  approval.executeApproveContract(f.firestore, actor, value);
const approvalFixture = () => {
  const f = fixture();
  f.contract().status = 'READY_FOR_REVIEW';
  return f;
};
const reviewRecords = (f) =>
  [...f.documents].filter(([p]) => p.includes('/reviews/'));
const rewardRecords = (f) =>
  [...f.documents].filter(([p]) => p.startsWith('rewards/'));
const approvalCode = (code, operation) =>
  assert.rejects(
    operation,
    (e) => e instanceof approval.ApproveContractCommandError && e.code === code,
  );
for (const cycle of [0, 2])
  test(`approval freezes reward and writes one immutable decision at round ${cycle}`, async () => {
    const f = approvalFixture();
    f.contract().reviewCycle = cycle;
    const before = clone(f.contract());
    assert.equal(rewardRecords(f).length, 0);
    const result = await approve(f);
    assert.equal(result.contract.status, 'APPROVED');
    assert.equal(result.contract.reviewCycle, cycle);
    assert.equal(result.review.cycle, cycle);
    assert.equal(result.review.decision, 'APPROVE');
    assert.equal(result.review.reviewerUid, 'parent');
    assert.equal(result.reward.status, 'PENDING_FULFILLMENT');
    assert.deepEqual(result.reward.terms, before.rewardTerms);
    assert.equal('fulfilledAt' in result.reward, false);
    assert.equal('fulfilledByUid' in result.reward, false);
    assert.deepEqual(f.contract(), {
      ...before,
      status: 'APPROVED',
      approvedAt: f.contract().approvedAt,
      updatedAt: f.contract().updatedAt,
    });
    assert.deepEqual(await approve(f), result);
    assert.equal(reviewRecords(f).length, 1);
    assert.equal(rewardRecords(f).length, 1);
    assert.equal(f.events().length, 1);
    assert.equal(f.events()[0][1].type, 'CONTRACT_APPROVED');
    assert.equal(f.events()[0][1].actorType, 'PARENT');
    assert.equal(f.events()[0][1].actorUid, 'parent');
    await approvalCode('IDEMPOTENCY_CONFLICT', () =>
      approve(f, 'parent', { ...approvalInput, contractId: 'other' }),
    );
    await approvalCode('INVALID_STATE', () =>
      approve(f, 'parent', {
        ...approvalInput,
        idempotencyKey: 'approval-new-key',
      }),
    );
  });
for (const [label, actor, prepare, code] of [
  ['unauthenticated', undefined, () => {}, 'AUTH_REQUIRED'],
  ['Child', 'child', () => {}, 'WRONG_ACTOR_ROLE'],
  ['other family', 'outside', () => {}, 'FAMILY_MEMBERSHIP_REQUIRED'],
  [
    'wrong Parent',
    'other',
    (f) =>
      f.documents.set('families/family/members/other', {
        role: 'PARENT',
        status: 'ACTIVE',
      }),
    'FORBIDDEN',
  ],
  [
    'inactive Parent',
    'parent',
    (f) =>
      (f.documents.get('families/family/members/parent').status = 'DISABLED'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'nonmember',
    'parent',
    (f) => f.documents.delete('families/family/members/parent'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'unlisted Parent',
    'parent',
    (f) => (f.contract().participantUids = ['child']),
    'FORBIDDEN',
  ],
  [
    'wrong family Contract',
    'parent',
    (f) => (f.contract().familyId = 'another'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'missing Contract',
    'parent',
    (f) => f.documents.delete('contracts/contract'),
    'CONTRACT_NOT_FOUND',
  ],
])
  test(`approval ${label} fails without any side effect`, async () => {
    const f = approvalFixture();
    prepare(f);
    const before = clone([...f.documents]);
    await approvalCode(code, () =>
      approval.executeApproveContract(f.firestore, actor, approvalInput),
    );
    assert.deepEqual([...f.documents], before);
  });
for (const status of [
  'ACTIVE',
  'CHANGES_REQUESTED',
  'APPROVED',
  'CANCELLED',
  'EXPIRED',
])
  test(`approval rejects ${status}`, async () => {
    const f = approvalFixture();
    f.contract().status = status;
    const before = clone([...f.documents]);
    await approvalCode('INVALID_STATE', () => approve(f));
    assert.deepEqual([...f.documents], before);
  });
test('approval strict API and linked Review/Reward schemas reject client authority and inconsistent output', async () => {
  const {
    approveContractInputSchema: schema,
    approveContractOutputSchema: output,
    contractReviewSchema,
    rewardSchema,
  } = require('@chorex/domain');
  for (const field of [
    'parentUid',
    'childUid',
    'familyId',
    'role',
    'cycle',
    'reviewCycle',
    'rewardId',
    'status',
    'note',
  ])
    assert.equal(
      schema.safeParse({ ...approvalInput, [field]: 'untrusted' }).success,
      false,
    );
  for (const patch of [{ contractId: '../bad' }, { idempotencyKey: 'short' }])
    assert.equal(
      schema.safeParse({ ...approvalInput, ...patch }).success,
      false,
    );
  const result = await approve(approvalFixture());
  assert.equal(output.safeParse(result).success, true);
  assert.equal(
    output.safeParse({ ...result, review: { ...result.review, cycle: 1 } })
      .success,
    false,
  );
  assert.equal(
    contractReviewSchema.safeParse({ ...result.review, cycle: -1 }).success,
    false,
  );
  assert.equal(
    rewardSchema.safeParse({
      ...result.reward,
      fulfilledAt: result.reward.earnedAt,
    }).success,
    false,
  );
  assert.equal(
    output.safeParse({
      ...result,
      reward: { ...result.reward, terms: { title: 'Changed', type: 'CUSTOM' } },
    }).success,
    false,
  );
});
test('approval same/different-key races commit one review, reward and event', async () => {
  for (const same of [true, false]) {
    const f = approvalFixture();
    const results = await Promise.allSettled([
      approve(f),
      approve(f, 'parent', {
        ...approvalInput,
        idempotencyKey: same
          ? approvalInput.idempotencyKey
          : 'approval-other-key',
      }),
    ]);
    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length,
      same ? 2 : 1,
    );
    if (same) assert.deepEqual(results[0].value, results[1].value);
    else
      assert.equal(
        results.find((r) => r.status === 'rejected').reason.code,
        'INVALID_STATE',
      );
    assert.equal(reviewRecords(f).length, 1);
    assert.equal(rewardRecords(f).length, 1);
    assert.equal(f.events().length, 1);
    assert.equal(f.contract().reviewCycle, 0);
  }
});
test('existing round decision or Reward blocks approval atomically; review identity is shared across decision types', async () => {
  for (const conflict of ['review', 'reward']) {
    const f = approvalFixture();
    const path =
      conflict === 'review'
        ? `contracts/contract/reviews/${approval.contractReviewId('contract', 0)}`
        : `rewards/${approval.contractRewardId('contract')}`;
    f.documents.set(path, { decision: 'REQUEST_CHANGES' });
    const before = clone([...f.documents]);
    await approvalCode('INVALID_STATE', () => approve(f));
    assert.deepEqual([...f.documents], before);
  }
});
test('approval transaction failure after staged writes rolls back every side effect', async () => {
  const f = approvalFixture();
  const before = clone([...f.documents]);
  const real = f.firestore.runTransaction;
  f.firestore.runTransaction = (fn) =>
    real(async (tx) => {
      await fn(tx);
      throw new Error('INJECTED_COMMIT_FAILURE');
    });
  await assert.rejects(approve(f), /INJECTED_COMMIT_FAILURE/);
  assert.deepEqual([...f.documents], before);
});
test('approval retry checks current access and retains original reward receipt after fulfillment', async () => {
  const f = approvalFixture();
  const first = await approve(f);
  f.documents.get(rewardRecords(f)[0][0]).status = 'FULFILLED';
  assert.deepEqual(await approve(f), first);
  f.documents.get('families/family/members/parent').status = 'DISABLED';
  await approvalCode('FAMILY_MEMBERSHIP_REQUIRED', () => approve(f));
});

test('approval preserves earlier reviews and all execution history; revoked or wrong-role membership fails', async () => {
  const f = approvalFixture();
  f.contract().reviewCycle = 2;
  f.documents.set('contracts/contract/reviews/previous-immutable', {
    cycle: 1,
    decision: 'REQUEST_CHANGES',
    note: 'Historical',
  });
  const previous = clone(
    f.documents.get('contracts/contract/reviews/previous-immutable'),
  );
  const task = clone(f.task());
  await approve(f);
  assert.deepEqual(
    f.documents.get('contracts/contract/reviews/previous-immutable'),
    previous,
  );
  assert.deepEqual(f.task(), task);
  for (const [field, value, code] of [
    ['status', 'INACTIVE', 'FAMILY_MEMBERSHIP_REQUIRED'],
    ['role', 'CHILD', 'WRONG_ACTOR_ROLE'],
  ]) {
    const denied = approvalFixture();
    denied.documents.get('families/family/members/parent')[field] = value;
    await approvalCode(code, () => approve(denied));
    assert.equal(denied.events().length, 0);
  }
});

const changes = require('../lib/requestContractChanges.js');
const changesInput = {
  contractId: 'contract',
  idempotencyKey: 'changes-key-001',
  note: '  Please check the result again.  ',
};
const requestChanges = (f, actor = 'parent', value = changesInput) =>
  changes.executeRequestContractChanges(f.firestore, actor, value);
const changesCode = (code, operation) =>
  assert.rejects(
    operation,
    (e) =>
      e instanceof changes.RequestContractChangesCommandError &&
      e.code === code,
  );
for (const cycle of [0, 2])
  test(`request changes records feedback at unchanged round ${cycle}, preserving all execution and negotiation history`, async () => {
    const f = approvalFixture();
    f.contract().reviewCycle = cycle;
    f.task().completedCount = f.task().targetCount;
    f.documents.set('contracts/contract/tasks/task/completions/old', {
      ordinal: 1,
    });
    f.documents.set('offers/offer/revisions/revision', {
      tasks: [{ title: 'Original' }],
    });
    if (cycle > 0)
      f.documents.set('contracts/contract/reviews/old', {
        cycle: cycle - 1,
        decision: 'REQUEST_CHANGES',
      });
    const before = clone([...f.documents]);
    const original = clone(f.contract());
    const result = await requestChanges(f);
    assert.equal(result.contract.status, 'CHANGES_REQUESTED');
    assert.equal(result.contract.reviewCycle, cycle);
    assert.equal(result.review.cycle, cycle);
    assert.equal(result.review.reviewerUid, 'parent');
    assert.equal(result.review.decision, 'REQUEST_CHANGES');
    assert.equal(result.review.note, changesInput.note.trim());
    assert.deepEqual(f.contract(), {
      ...original,
      status: 'CHANGES_REQUESTED',
      updatedAt: f.contract().updatedAt,
    });
    for (const [path, data] of before)
      if (path !== 'contracts/contract')
        assert.deepEqual(f.documents.get(path), data);
    assert.equal(rewardRecords(f).length, 0);
    assert.equal(f.events().length, 1);
    assert.equal(f.events()[0][1].type, 'CONTRACT_CHANGES_REQUESTED');
    assert.equal(f.events()[0][1].actorType, 'PARENT');
    assert.equal(f.events()[0][1].actorUid, 'parent');
    assert.equal(
      JSON.stringify(f.events()).includes(result.review.note),
      false,
    );
    assert.deepEqual(await requestChanges(f), result);
    assert.equal(f.events().length, 1);
    await changesCode('IDEMPOTENCY_CONFLICT', () =>
      requestChanges(f, 'parent', {
        ...changesInput,
        note: 'Different feedback',
      }),
    );
    await changesCode('IDEMPOTENCY_CONFLICT', () =>
      requestChanges(f, 'parent', { ...changesInput, contractId: 'other' }),
    );
    await changesCode('INVALID_STATE', () =>
      requestChanges(f, 'parent', {
        ...changesInput,
        idempotencyKey: 'changes-new-key',
      }),
    );
  });
test('request changes strict required feedback schema and linked canonical output', async () => {
  const {
    requestContractChangesInputSchema: inputSchema,
    requestContractChangesOutputSchema: outputSchema,
  } = require('@chorex/domain');
  for (const note of ['', ' \n ', undefined, 'x'.repeat(501)])
    await changesCode('INVALID_INPUT', () =>
      requestChanges(approvalFixture(), 'parent', { ...changesInput, note }),
    );
  for (const field of [
    'parentUid',
    'childUid',
    'familyId',
    'role',
    'reviewCycle',
    'cycle',
    'status',
    'reviewerUid',
  ])
    assert.equal(
      inputSchema.safeParse({ ...changesInput, [field]: 'untrusted' }).success,
      false,
    );
  const result = await requestChanges(approvalFixture());
  assert.equal(outputSchema.safeParse(result).success, true);
  for (const patch of [
    { cycle: 1 },
    { note: '' },
    { reviewerUid: 'other' },
    { decision: 'APPROVE' },
  ])
    assert.equal(
      outputSchema.safeParse({
        ...result,
        review: { ...result.review, ...patch },
      }).success,
      false,
    );
});
for (const [label, actor, prepare, code] of [
  ['unauthenticated', undefined, () => {}, 'AUTH_REQUIRED'],
  ['Child', 'child', () => {}, 'WRONG_ACTOR_ROLE'],
  ['other family', 'outside', () => {}, 'FAMILY_MEMBERSHIP_REQUIRED'],
  [
    'wrong Parent',
    'other',
    (f) =>
      f.documents.set('families/family/members/other', {
        role: 'PARENT',
        status: 'ACTIVE',
      }),
    'FORBIDDEN',
  ],
  [
    'inactive',
    'parent',
    (f) =>
      (f.documents.get('families/family/members/parent').status = 'INACTIVE'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'disabled',
    'parent',
    (f) =>
      (f.documents.get('families/family/members/parent').status = 'DISABLED'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'nonmember',
    'parent',
    (f) => f.documents.delete('families/family/members/parent'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'wrong role',
    'parent',
    (f) => (f.documents.get('families/family/members/parent').role = 'CHILD'),
    'WRONG_ACTOR_ROLE',
  ],
  [
    'wrong Contract family',
    'parent',
    (f) => (f.contract().familyId = 'another'),
    'FAMILY_MEMBERSHIP_REQUIRED',
  ],
  [
    'unlisted participant',
    'parent',
    (f) => (f.contract().participantUids = ['child']),
    'FORBIDDEN',
  ],
  [
    'missing Contract',
    'parent',
    (f) => f.documents.delete('contracts/contract'),
    'CONTRACT_NOT_FOUND',
  ],
])
  test(`request changes ${label} fails atomically`, async () => {
    const f = approvalFixture();
    prepare(f);
    const before = clone([...f.documents]);
    await changesCode(code, () =>
      changes.executeRequestContractChanges(f.firestore, actor, changesInput),
    );
    assert.deepEqual([...f.documents], before);
  });
for (const status of [
  'ACTIVE',
  'CHANGES_REQUESTED',
  'APPROVED',
  'CANCELLED',
  'EXPIRED',
])
  test(`request changes rejects ${status}`, async () => {
    const f = approvalFixture();
    f.contract().status = status;
    const before = clone([...f.documents]);
    await changesCode('INVALID_STATE', () => requestChanges(f));
    assert.deepEqual([...f.documents], before);
  });
test('request changes retries and different-key races create one decision', async () => {
  for (const same of [true, false]) {
    const f = approvalFixture();
    const results = await Promise.allSettled([
      requestChanges(f),
      requestChanges(f, 'parent', {
        ...changesInput,
        idempotencyKey: same
          ? changesInput.idempotencyKey
          : 'changes-other-key',
      }),
    ]);
    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length,
      same ? 2 : 1,
    );
    if (same) assert.deepEqual(results[0].value, results[1].value);
    else
      assert.equal(
        results.find((r) => r.status === 'rejected').reason.code,
        'INVALID_STATE',
      );
    assert.equal(reviewRecords(f).length, 1);
    assert.equal(rewardRecords(f).length, 0);
    assert.equal(f.events().length, 1);
  }
});
test('approve versus request changes shares one review slot in either ordering', async () => {
  for (const approvalFirst of [true, false]) {
    const f = approvalFixture();
    const results = await Promise.allSettled(
      approvalFirst
        ? [approve(f), requestChanges(f)]
        : [requestChanges(f), approve(f)],
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.code,
      'INVALID_STATE',
    );
    assert.equal(reviewRecords(f).length, 1);
    assert.equal(f.events().length, 1);
    assert.equal(f.contract().reviewCycle, 0);
    assert.equal(
      f.contract().status,
      approvalFirst ? 'APPROVED' : 'CHANGES_REQUESTED',
    );
    assert.equal(
      reviewRecords(f)[0][1].decision,
      approvalFirst ? 'APPROVE' : 'REQUEST_CHANGES',
    );
    assert.equal(rewardRecords(f).length, approvalFirst ? 1 : 0);
  }
});
test('request changes commit failure rolls back; retries revalidate access and preserve original review after later state', async () => {
  const f = approvalFixture();
  const before = clone([...f.documents]);
  const real = f.firestore.runTransaction;
  f.firestore.runTransaction = (fn) =>
    real(async (tx) => {
      await fn(tx);
      throw new Error('INJECTED_ABORT');
    });
  await assert.rejects(requestChanges(f), /INJECTED_ABORT/);
  assert.deepEqual([...f.documents], before);
  f.firestore.runTransaction = real;
  const result = await requestChanges(f);
  f.contract().status = 'READY_FOR_REVIEW';
  f.contract().reviewCycle = 1;
  assert.deepEqual(await requestChanges(f), result);
  f.documents.get('families/family/members/parent').status = 'DISABLED';
  await changesCode('FAMILY_MEMBERSHIP_REQUIRED', () => requestChanges(f));
});
