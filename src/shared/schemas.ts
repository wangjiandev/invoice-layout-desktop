import { z } from 'zod';

export const pdfPathsSchema = z
  .array(z.string().min(1).max(4096))
  .min(1)
  .max(500)
  .refine((paths) => paths.every((path) => path.toLowerCase().endsWith('.pdf')), {
    message: '仅支持 PDF 文件',
  });

export const layoutSettingsSchema = z.object({
  paperSize: z.literal('A4'),
  standardPerPage: z.literal(2),
  railPerPage: z.literal(8),
  marginMm: z.number().finite().min(0).max(20),
  showCutLines: z.boolean(),
  includeSummary: z.boolean(),
});
