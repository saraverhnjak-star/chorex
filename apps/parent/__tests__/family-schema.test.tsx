import {
  createChildInputSchema,
  createChildOutputSchema,
  createFamilyInputSchema,
  createFamilyOutputSchema,
  createOfferDraftInputSchema,
  createOfferDraftOutputSchema,
  createPairingSessionInputSchema,
  createPairingSessionOutputSchema,
  offerValidationBounds,
  persistedParentProfileSchema,
} from '@chorex/domain';

const timestamp = '2026-10-03T12:34:56.789Z';

describe('family bootstrap schemas', () => {
  it('trims names and rejects authoritative fields', () => {
    expect(
      createFamilyInputSchema.parse({
        displayName: '  Alex  ',
        familyName: '  Rivera Family  ',
      }),
    ).toEqual({ displayName: 'Alex', familyName: 'Rivera Family' });

    expect(
      createFamilyInputSchema.safeParse({
        displayName: 'Alex',
        familyName: 'Rivera Family',
        role: 'PARENT',
      }).success,
    ).toBe(false);
  });

  it('parses a Parent profile and canonical createFamily output', () => {
    const profile = persistedParentProfileSchema.parse({
      uid: 'parent-uid',
      displayName: 'Alex',
      accountType: 'PARENT',
      createdAt: timestamp,
    });

    expect(
      createFamilyOutputSchema.parse({
        profile,
        family: {
          id: 'family-id',
          name: 'Rivera Family',
          createdBy: 'parent-uid',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        membership: {
          uid: 'parent-uid',
          familyId: 'family-id',
          role: 'PARENT',
          displayName: 'Alex',
          status: 'ACTIVE',
          joinedAt: timestamp,
        },
      }).family.id,
    ).toBe('family-id');
  });

  it('rejects non-normalized timestamps', () => {
    expect(
      persistedParentProfileSchema.safeParse({
        uid: 'parent-uid',
        displayName: 'Alex',
        accountType: 'PARENT',
        createdAt: '2026-10-03T12:34:56Z',
      }).success,
    ).toBe(false);
  });
});

describe('child creation schemas', () => {
  it('accepts only family, display name, and idempotency key', () => {
    expect(
      createChildInputSchema.parse({
        familyId: 'family-id',
        displayName: '  Mia  ',
        idempotencyKey: 'create-mia-001',
      }),
    ).toEqual({
      familyId: 'family-id',
      displayName: 'Mia',
      idempotencyKey: 'create-mia-001',
    });

    expect(
      createChildInputSchema.safeParse({
        familyId: 'family-id',
        displayName: 'Mia',
        idempotencyKey: 'create-mia-001',
        role: 'CHILD',
      }).success,
    ).toBe(false);
  });

  it('parses canonical child creation output', () => {
    expect(
      createChildOutputSchema.parse({
        profile: {
          uid: 'child-uid',
          displayName: 'Mia',
          accountType: 'CHILD',
          createdAt: timestamp,
        },
        membership: {
          uid: 'child-uid',
          familyId: 'family-id',
          role: 'CHILD',
          displayName: 'Mia',
          status: 'ACTIVE',
          joinedAt: timestamp,
        },
      }).membership.uid,
    ).toBe('child-uid');
  });
});

describe('pairing session schemas', () => {
  it('accepts only family, child, and idempotency fields', () => {
    expect(
      createPairingSessionInputSchema.parse({
        familyId: 'family-id',
        childUid: 'child-uid',
        idempotencyKey: 'pair-child-001',
      }),
    ).toEqual({
      familyId: 'family-id',
      childUid: 'child-uid',
      idempotencyKey: 'pair-child-001',
    });
    expect(
      createPairingSessionInputSchema.safeParse({
        familyId: 'family-id',
        childUid: 'child-uid',
        idempotencyKey: 'pair-child-001',
        token: 'client-token',
      }).success,
    ).toBe(false);
  });

  it('parses the first response token and a tokenless replay', () => {
    const first = createPairingSessionOutputSchema.parse({
      sessionId: 'session-id',
      expiresAt: timestamp,
      token: 'AbCdEfGhIjKlMnOpQrStUw',
    });
    const replay = createPairingSessionOutputSchema.parse({
      sessionId: first.sessionId,
      expiresAt: first.expiresAt,
    });
    expect(first.token).toHaveLength(22);
    expect(replay.token).toBeUndefined();
  });
});

describe('Offer draft schemas', () => {
  const deadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const validInput = {
    familyId: 'family-id',
    childUid: 'child-id',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: { title: 'Cinema', type: 'EXPERIENCE' as const },
    deadlineAt,
    idempotencyKey: 'offer-draft-001',
  };

  it('normalizes supported terms and omits absent optional fields', () => {
    expect(
      createOfferDraftInputSchema.parse({
        ...validInput,
        tasks: [{ title: '  Load the dishwasher  ', targetCount: 2 }],
        reward: {
          title: '  Cinema  ',
          description: '  Choose the film  ',
          type: 'EXPERIENCE',
        },
      }),
    ).toEqual({
      ...validInput,
      reward: {
        title: 'Cinema',
        description: 'Choose the film',
        type: 'EXPERIENCE',
      },
    });
  });

  it('rejects authoritative fields, abusive bounds, and past deadlines', () => {
    expect(
      createOfferDraftInputSchema.safeParse({
        ...validInput,
        parentUid: 'client-controlled',
      }).success,
    ).toBe(false);
    expect(
      createOfferDraftInputSchema.safeParse({
        ...validInput,
        tasks: Array.from(
          { length: offerValidationBounds.taskCountMax + 1 },
          (_, index) => ({ title: `Task ${index}`, targetCount: 1 }),
        ),
      }).success,
    ).toBe(false);
    expect(
      createOfferDraftInputSchema.safeParse({
        ...validInput,
        deadlineAt: '2020-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      createOfferDraftInputSchema.safeParse({
        ...validInput,
        tasks: [],
      }).success,
    ).toBe(false);
    expect(
      createOfferDraftInputSchema.safeParse({
        ...validInput,
        tasks: [
          {
            title: 'Load the dishwasher',
            targetCount: offerValidationBounds.targetCountMax + 1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('parses a canonical draft and immutable initial revision', () => {
    const output = createOfferDraftOutputSchema.parse({
      offer: {
        id: 'offer-id',
        familyId: 'family-id',
        parentUid: 'parent-id',
        childUid: 'child-id',
        status: 'DRAFT',
        currentRevisionId: 'revision-id',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      revision: {
        id: 'revision-id',
        offerId: 'offer-id',
        revisionNumber: 1,
        proposedByUid: 'parent-id',
        proposedByRole: 'PARENT',
        tasks: validInput.tasks,
        reward: validInput.reward,
        deadlineAt,
        createdAt: timestamp,
      },
    });

    expect(output.offer.status).toBe('DRAFT');
    expect(output.revision.revisionNumber).toBe(1);
    expect(output.revision.reward.description).toBeUndefined();
  });
});
