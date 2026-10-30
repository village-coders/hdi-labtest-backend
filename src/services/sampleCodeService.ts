import { Counter } from '../models/Counter.js';

export interface GenerateCodeParams {
  dateOfEntry: Date | string;
  sampleNature: string;
}

export const determineCodePrefix = (sampleNature: string): 'FD' | 'NF' => {
  if (!sampleNature) return 'FD';
  // 'Food - Solid/Liquid/Semi-Solid' => FD prefix; 'Non-Food - ...' => NF prefix
  const lower = sampleNature.toLowerCase();
  if (
    lower.startsWith('food') ||
        lower.includes('edible') ||
    lower.includes('snack') ||
    lower.includes('confectionery') ||
    lower.startsWith('fd')
  ) {
    return 'FD';
  }
  return 'NF';
};

export const getMonthYearString = (dateInput: Date | string): { mm: string; yy: string } => {
  const d = new Date(dateInput);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return { mm: month, yy: year };
};

export const generateSampleCode = async (params: GenerateCodeParams): Promise<string> => {
  const prefix = determineCodePrefix(params.sampleNature);
  const { mm, yy } = getMonthYearString(params.dateOfEntry);
  const counterKey = `${prefix}_${mm}_${yy}`;

  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seqNumber = counter.seq;
  const paddedSeq = String(seqNumber).padStart(3, '0');

  // Format: [prefix]/[month][year]/Ext[seq] (e.g. FD/1026/Ext001 - no stroke between month and year)
  return `${prefix}/${mm}${yy}/Ext${paddedSeq}`;
};

export const previewNextSampleCode = async (params: GenerateCodeParams): Promise<string> => {
  const prefix = determineCodePrefix(params.sampleNature);
  const { mm, yy } = getMonthYearString(params.dateOfEntry);
  const counterKey = `${prefix}_${mm}_${yy}`;

  const counter = await Counter.findOne({ key: counterKey });
  const nextSeq = (counter ? counter.seq : 0) + 1;
  const paddedSeq = String(nextSeq).padStart(3, '0');

  // Format: [prefix]/[month][year]/Ext[seq] (e.g. FD/1026/Ext001 - no stroke between month and year)
  return `${prefix}/${mm}${yy}/Ext${paddedSeq}`;
};
