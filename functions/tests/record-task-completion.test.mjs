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
