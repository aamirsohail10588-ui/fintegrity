import { z } from "zod";

export const LedgerEntrySchema = z
  .object({
    accountId: z.string().min(1),
    debit: z.number().nonnegative(),
    credit: z.number().nonnegative(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.debit === 0 && entry.credit === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entry must have debit or credit",
      });
    }

    if (entry.debit > 0 && entry.credit > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entry cannot have both debit and credit",
      });
    }
  });

export const RawTransactionSchema = z
  .object({
    entityId: z.string().min(1),
    reference: z.string().trim().min(1),
    entries: z.array(LedgerEntrySchema).min(1),
    correctionOf: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const totalDebit = data.entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = data.entries.reduce((s, e) => s + e.credit, 0);

    if (totalDebit !== totalCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Transaction must be balanced",
      });
    }

    if (totalDebit === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Transaction cannot be zero value",
      });
    }
  });

export type RawTransactionInputValidated = z.infer<typeof RawTransactionSchema>;
