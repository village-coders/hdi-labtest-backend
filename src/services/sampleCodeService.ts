import { Counter } from '../models/Counter.js';

export interface GenerateCodeParams {
  dateOfEntry: Date | string;
  sampleNature: string;
}

/**
 * Extracts Nature Prefix (FD / NF) and Form Code (SOL / LIQ / SS)
 * Format:
 * Nature of product: FD / NF
 * Form of product: SOL (Solid) / LIQ (Liquid) / SS (Semi-Solid)
 * e.g. "Food - Solid" => prefix: "FD", form: "SOL"
 * Combined prefix: "FD-SOL"
 */
export const determineCodeParts = (sampleNature: string): { prefix: 'FD' | 'NF'; form: 'SOL' | 'LIQ' | 'SS'; combined: string } => {
  if (!sampleNature) return { prefix: 'FD', form: 'SOL', combined: 'FD-SOL' };

  const lower = sampleNature.toLowerCase();

  // 1. Prefix: FD vs NF
  let prefix: 'FD' | 'NF' = 'NF';
  if (
    lower.startsWith('food') ||
    lower.includes('edible') ||
    lower.includes('snack') ||
    lower.includes('confectionery') ||
    lower.startsWith('fd')
  ) {
    prefix = 'FD';
  }

  // 2. Form: SOL (Solid), LIQ (Liquid), SS (Semi-Solid)
  let form: 'SOL' | 'LIQ' | 'SS' = 'SOL';
  if (lower.includes('semi-solid') || lower.includes('semisolid') || lower.includes('ss')) {
    form = 'SS';
  } else if (lower.includes('liquid') || lower.includes('liq') || lower.includes('beverage') || lower.includes('water')) {
    form = 'LIQ';
  } else if (lower.includes('solid') || lower.includes('sol')) {
    form = 'SOL';
  }

  return { prefix, form, combined: `${prefix}-${form}` };
};

export const determineCodePrefix = (sampleNature: string): string => {
  return determineCodeParts(sampleNature).combined;
};

export const getMonthYearString = (dateInput: Date | string): { mm: string; yy: string } => {
  const d = new Date(dateInput);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return { mm: month, yy: year };
};

export const generateSampleCode = async (params: GenerateCodeParams): Promise<string> => {
  const { combined } = determineCodeParts(params.sampleNature);
  const { mm, yy } = getMonthYearString(params.dateOfEntry);
  const counterKey = `${combined}_${mm}_${yy}`;

  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seqNumber = counter.seq;
  const paddedSeq = String(seqNumber).padStart(3, '0');

  // Format: (Nature - Form)/(MonthYear)/Ext(sample no.)
  // e.g. FD-SOL/1026/Ext001
  return `${combined}/${mm}${yy}/Ext${paddedSeq}`;
};

export const previewNextSampleCode = async (params: GenerateCodeParams): Promise<string> => {
  const { combined } = determineCodeParts(params.sampleNature);
  const { mm, yy } = getMonthYearString(params.dateOfEntry);
  const counterKey = `${combined}_${mm}_${yy}`;

  const counter = await Counter.findOne({ key: counterKey });
  const nextSeq = (counter ? counter.seq : 0) + 1;
  const paddedSeq = String(nextSeq).padStart(3, '0');

  // Format: (Nature - Form)/(MonthYear)/Ext(sample no.)
  // e.g. FD-SOL/1026/Ext001
  return `${combined}/${mm}${yy}/Ext${paddedSeq}`;
};
