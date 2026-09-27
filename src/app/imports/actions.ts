"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { validateImport, commitImport, type ImportPreview, type ImportResult } from "@/server/csv/import";
import { AppError } from "@/server/errors";

export interface ImportFormState {
  error?: string;
  preview?: {
    totalRows: number;
    validRows: number;
    errors: { row: number; message: string }[];
  };
  // The exact CSV text that produced the preview, carried forward so the
  // commit step operates on precisely what staff reviewed — not whatever
  // might be in the textarea at click time.
  csv?: string;
  result?: ImportResult;
}

function toPreviewSummary(preview: ImportPreview) {
  return { totalRows: preview.totalRows, validRows: preview.validRows, errors: preview.errors };
}

export async function validateImportAction(
  _prevState: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const ctx = await requireStaffContext();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) {
    return { error: "Paste or upload CSV content first." };
  }

  try {
    const preview = validateImport(ctx, csv);
    return { preview: toPreviewSummary(preview), csv };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
}

export async function commitImportAction(
  _prevState: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const ctx = await requireStaffContext();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) {
    return { error: "No CSV content to commit." };
  }

  try {
    const result = await commitImport(prisma, ctx, csv);
    revalidatePath("/imports");
    return { result };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
}
