import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .regex(/^[\x21-\x7e]+$/);
export const passwordSchema = z
  .string()
  .min(15)
  .max(128)
  .refine((value) => new TextEncoder().encode(value).length <= 512)
  .refine(
    (value) =>
      !['123456789012345', 'passwordpassword', 'password123456789', 'qwertyuiopasdfgh'].includes(
        value.toLowerCase(),
      ),
  );
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) =>
    Array.from(value).every(
      (character) => character.codePointAt(0)! >= 32 && character.codePointAt(0) !== 127,
    ),
  );
export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1)
      .max(128)
      .refine((v) => new TextEncoder().encode(v).length <= 512),
  })
  .strict();
export const versionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const profileInputSchema = z.object({ name: nameSchema, version: versionSchema }).strict();
export const userSchema = z.object({
  id: z.string(),
  name: nameSchema,
  email: emailSchema,
  role: z.enum(['customer', 'admin']),
  version: versionSchema,
});
export const addressInputSchema = z
  .object({
    recipient: nameSchema,
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).default(''),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().regex(/^[1-9]\d{5}$/),
    countryCode: z.literal('IN').default('IN'),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[ ()-]/g, ''))
      .pipe(z.string().regex(/^\+?\d{10,15}$/)),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const addressUpdateSchema = addressInputSchema.extend({ version: versionSchema }).strict();
export const addressSchema = z.object({
  id: z.string(),
  recipient: z.string(),
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
  countryCode: z.literal('IN'),
  phone: z.string(),
  isDefault: z.boolean(),
  version: versionSchema,
});
export const sessionSchema = z.object({
  data: z.object({
    user: userSchema.nullable(),
    csrfToken: z.string().min(1),
    authProvider: z.enum(['local', 'supabase']).default('local'),
  }),
  requestId: z.string(),
});
export const registrationResultSchema = z.union([
  sessionSchema,
  z.object({
    data: z.object({ verificationRequired: z.literal(true), message: z.string().max(500) }),
    requestId: z.string(),
  }),
]);
export const meSchema = z.object({ data: userSchema, requestId: z.string() });
export const addressesSchema = z.object({ data: z.array(addressSchema), requestId: z.string() });
export type User = z.infer<typeof userSchema>;
export type Address = z.infer<typeof addressSchema>;
