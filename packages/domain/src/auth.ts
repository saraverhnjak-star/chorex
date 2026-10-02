import { z } from 'zod';

export const parentPasswordMinimumLength = 6;

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.');

export const signInCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const registrationCredentialsSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(
        parentPasswordMinimumLength,
        `Use at least ${parentPasswordMinimumLength} characters.`,
      ),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine(
    (credentials) => credentials.password === credentials.confirmPassword,
    {
      message: 'Passwords must match.',
      path: ['confirmPassword'],
    },
  );

export type SignInCredentialsInput = z.input<typeof signInCredentialsSchema>;
export type SignInCredentials = z.output<typeof signInCredentialsSchema>;
export type RegistrationCredentialsInput = z.input<
  typeof registrationCredentialsSchema
>;
export type RegistrationCredentials = z.output<
  typeof registrationCredentialsSchema
>;
