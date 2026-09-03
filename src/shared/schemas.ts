import { z } from 'zod';
import { invoiceCategories } from './types';

export const pdfPathsSchema = z
  .array(z.string().min(1).max(4096))
  .min(1)
  .max(500)
  .refine((paths) => paths.every((path) => path.toLowerCase().endsWith('.pdf')), {
    message: '仅支持 PDF 文件',
  });

export const fileIdSchema = z.string().uuid();
export const generationIdSchema = z.string().uuid();
export const artifactKindSchema = z.enum(['bundle', 'standard', 'rail']);

export const layoutSettingsSchema = z.object({
  paperSize: z.literal('A4'),
  standardPerPage: z.literal(2),
  railPerPage: z.literal(8),
  marginMm: z.number().finite().min(0).max(20),
  showCutLines: z.boolean(),
  includeSummary: z.boolean(),
});

export const invoiceCategorySchema = z.enum(invoiceCategories);

export const generatedPdfInputSchema = z.object({
  kind: artifactKindSchema,
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 250 * 1024 * 1024, {
    message: '生成的 PDF 超过 250 MB',
  }),
  pageCount: z.number().int().positive().max(10_000),
});

export const generatedPdfInputsSchema = z
  .array(generatedPdfInputSchema)
  .min(1)
  .max(3)
  .refine((items) => new Set(items.map((item) => item.kind)).size === items.length, {
    message: '生成产物类型不能重复',
  });
