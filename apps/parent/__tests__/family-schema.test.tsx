import {
  createChildInputSchema,
  createChildOutputSchema,
  createFamilyInputSchema,
  createFamilyOutputSchema,
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
