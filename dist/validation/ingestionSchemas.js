"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawTransactionSchema = exports.LedgerEntrySchema = void 0;
const zod_1 = require("zod");
exports.LedgerEntrySchema = zod_1.z
    .object({
    accountId: zod_1.z.string().min(1),
    debit: zod_1.z.number().nonnegative(),
    credit: zod_1.z.number().nonnegative(),
})
    .strict()
    .superRefine((entry, ctx) => {
    if (entry.debit === 0 && entry.credit === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Entry must have debit or credit",
        });
    }
    if (entry.debit > 0 && entry.credit > 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Entry cannot have both debit and credit",
        });
    }
});
exports.RawTransactionSchema = zod_1.z
    .object({
    entityId: zod_1.z.string().min(1),
    reference: zod_1.z.string().trim().min(1),
    entries: zod_1.z.array(exports.LedgerEntrySchema).min(1),
    correctionOf: zod_1.z.string().optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    const totalDebit = data.entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = data.entries.reduce((s, e) => s + e.credit, 0);
    if (totalDebit !== totalCredit) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Transaction must be balanced",
        });
    }
    if (totalDebit === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Transaction cannot be zero value",
        });
    }
});
