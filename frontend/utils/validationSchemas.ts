/**
 * Zod validation schemas for Tikhat Partner forms.
 * Rules aligned with PROJECT_KNOWLEDGE.md Section 25 + backend auth validators.
 */

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_CAPITAL_DEPOSIT,
  MAX_FILE_SIZE_MB,
  MIN_CAPITAL_DEPOSIT,
  MIN_WITHDRAWAL,
  UPI_TRANSFER_LIMIT,
} from '../constants';
import {
  isValidAadhar,
  isValidEmail,
  isValidFullName,
  isValidIndianMobile,
  isValidPAN,
} from './validators';

export { zodResolver };

const MAX_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

export const pickedFileSchema = z.object({
  uri: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  size: z.number().optional(),
});

export type PickedFile = z.infer<typeof pickedFileSchema>;

function refineFile(
  file: PickedFile,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): void {
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime) && !/\.(jpe?g|png|pdf)$/i.test(file.name)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only JPG, PNG, or PDF files are allowed',
      path,
    });
  }
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `File must be ${MAX_FILE_SIZE_MB}MB or smaller`,
      path,
    });
  }
}

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .refine(isValidEmail, 'Enter a valid email address');

export const mobileSchema = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .min(1, 'Mobile number is required')
  .refine(isValidIndianMobile, 'Enter a valid 10-digit Indian mobile number');

export const fullNameSchema = z
  .string({ required_error: 'Full name is required' })
  .trim()
  .min(1, 'Full name is required')
  .refine(
    isValidFullName,
    'Full name must be at least 3 characters and contain only alphabets and spaces'
  );

export const otpCodeSchema = z
  .string({ required_error: 'OTP is required' })
  .trim()
  .regex(/^\d{6}$/, 'OTP must be a 6-digit number');

export const deviceTypeSchema = z.enum(['mobile', 'web'], {
  required_error: 'Device type is required',
  invalid_type_error: 'Device type must be mobile or web',
});

export const panSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine(isValidPAN, 'Enter a valid PAN (e.g. ABCDE1234F)');

export const aadharSchema = z
  .string()
  .trim()
  .refine(isValidAadhar, 'Aadhar must be exactly 12 digits');

/** Registration form */
export const registrationSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  mobile: mobileSchema,
  accept_terms: z
    .boolean()
    .refine((v) => v === true, 'You must accept the Terms & Privacy Policy'),
});

export type RegistrationFormValues = z.infer<typeof registrationSchema>;

/** Login form */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
  device_type: deviceTypeSchema,
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** OTP verification form */
export const otpSchema = z.object({
  email: emailSchema,
  otp: otpCodeSchema,
  device_type: deviceTypeSchema,
});

export type OtpFormValues = z.infer<typeof otpSchema>;

/** Capital deposit (add) form */
export const capitalAddSchema = z
  .object({
    amount: z
      .number({
        required_error: 'Amount is required',
        invalid_type_error: 'Amount is required',
      })
      .int('Amount must be a whole number')
      .min(
        MIN_CAPITAL_DEPOSIT,
        `Minimum capital deposit is ₹${MIN_CAPITAL_DEPOSIT.toLocaleString('en-IN')}`
      )
      .max(
        MAX_CAPITAL_DEPOSIT,
        `Maximum capital deposit is ₹${MAX_CAPITAL_DEPOSIT.toLocaleString('en-IN')}`
      ),
    transfer_date: z
      .string({ required_error: 'Transfer date is required' })
      .min(1, 'Transfer date is required'),
    utr_number: z
      .string({ required_error: 'UTR number is required' })
      .trim()
      .min(8, 'UTR number must be at least 8 characters')
      .max(30, 'UTR number is too long'),
    payment_screenshot: pickedFileSchema,
    remark: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    refineFile(data.payment_screenshot, ctx, ['payment_screenshot']);
  });

export type CapitalAddFormValues = z.infer<typeof capitalAddSchema>;

/** Capital / revenue withdrawal form */
export const capitalWithdrawSchema = z
  .object({
    amount: z
      .number({
        required_error: 'Amount is required',
        invalid_type_error: 'Amount is required',
      })
      .int('Amount must be a whole number')
      .min(
        MIN_WITHDRAWAL,
        `Minimum withdrawal is ₹${MIN_WITHDRAWAL.toLocaleString('en-IN')}`
      ),
    account_type: z.enum(['capital', 'revenue'], {
      required_error: 'Account type is required',
    }),
    transfer_mode: z.enum(['bank', 'upi'], {
      required_error: 'Transfer mode is required',
    }),
  })
  .superRefine((data, ctx) => {
    if (data.transfer_mode === 'upi' && data.amount > UPI_TRANSFER_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `UPI transfers cannot exceed ₹${UPI_TRANSFER_LIMIT.toLocaleString('en-IN')}`,
        path: ['amount'],
      });
    }
  });

export type CapitalWithdrawFormValues = z.infer<typeof capitalWithdrawSchema>;

/** Profile update form (any subset of editable fields) */
export const profileUpdateSchema = z
  .object({
    full_name: fullNameSchema.optional(),
    date_of_birth: z.string().optional(),
    address: z.string().trim().min(5, 'Address is too short').optional(),
    pan_number: panSchema.optional(),
    aadhar_number: aadharSchema.optional(),
    bank_account_number: z
      .string()
      .trim()
      .min(9, 'Enter a valid account number')
      .max(18, 'Enter a valid account number')
      .optional(),
    bank_ifsc: z
      .string()
      .trim()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Enter a valid IFSC code')
      .optional(),
    bank_account_name: z.string().trim().min(3).optional(),
    bank_name: z.string().trim().min(2).optional(),
    upi_id: z
      .string()
      .trim()
      .regex(/^[\w.-]+@[\w.-]+$/, 'Enter a valid UPI ID')
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined && v !== ''),
    { message: 'Update at least one field' }
  );

export type ProfileUpdateFormValues = z.infer<typeof profileUpdateSchema>;

const supportCategories = [
  'general',
  'capital',
  'revenue',
  'withdrawal',
  'kyc',
  'technical',
  'other',
] as const;

/** Support ticket form */
export const supportTicketSchema = z
  .object({
    category: z.enum(supportCategories, {
      required_error: 'Category is required',
    }),
    subject: z
      .string({ required_error: 'Subject is required' })
      .trim()
      .min(5, 'Subject must be at least 5 characters')
      .max(120, 'Subject is too long'),
    message: z
      .string({ required_error: 'Message is required' })
      .trim()
      .min(10, 'Message must be at least 10 characters')
      .max(5000, 'Message is too long'),
    attachments: z.array(pickedFileSchema).max(5, 'Maximum 5 attachments').optional(),
  })
  .superRefine((data, ctx) => {
    (data.attachments || []).forEach((file, index) => {
      refineFile(file, ctx, ['attachments', index]);
    });
  });

export type SupportTicketFormValues = z.infer<typeof supportTicketSchema>;

export const validationSchemas = {
  registration: registrationSchema,
  login: loginSchema,
  otp: otpSchema,
  capitalAdd: capitalAddSchema,
  capitalWithdraw: capitalWithdrawSchema,
  profileUpdate: profileUpdateSchema,
  supportTicket: supportTicketSchema,
} as const;
