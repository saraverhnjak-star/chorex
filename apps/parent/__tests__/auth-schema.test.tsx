import {
  registrationCredentialsSchema,
  signInCredentialsSchema,
} from '@chorex/domain';

describe('parent authentication credentials', () => {
  it('rejects an invalid email address', () => {
    expect(
      signInCredentialsSchema.safeParse({
        email: 'not-an-email',
        password: 'secret',
      }).success,
    ).toBe(false);
  });

  it.each([
    {
      email: 'parent@example.invalid',
      password: 'short',
      confirmPassword: 'short',
    },
    {
      email: 'parent@example.invalid',
      password: 'valid-password',
      confirmPassword: 'different-password',
    },
  ])('rejects invalid registration passwords', (credentials) => {
    expect(registrationCredentialsSchema.safeParse(credentials).success).toBe(
      false,
    );
  });

  it('accepts valid credentials and trims surrounding email whitespace', () => {
    expect(
      registrationCredentialsSchema.parse({
        email: '  parent@example.invalid  ',
        password: 'valid-password',
        confirmPassword: 'valid-password',
      }),
    ).toEqual({
      email: 'parent@example.invalid',
      password: 'valid-password',
      confirmPassword: 'valid-password',
    });
  });
});
