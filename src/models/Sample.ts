import mongoose, { Schema, Document } from 'mongoose';

export type ResultStatusType = 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
export type WorkflowStatusType =
  | 'Received'
  | 'Registered'
  | 'Sent to Lab'
  | 'In Processing'
  | 'Result Received'
  | 'Closed'
  | 'Rejected';

export interface IComment {
  _id?: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: string;
  message: string;
  attachmentUrl?: string;
  createdAt: Date;
}

export interface IStatusHistory {
  status: WorkflowStatusType;
  changedBy: string;
  note?: string;
  timestamp: Date;
}

export interface ISample extends Document {
  // Section A: Sample Information
  sampleName: string;
  companyName: string;
  sampleCode: string; // FD/MM/YY/ExtXXX or NF/MM/YY/ExtXXX
  sampleNature: string; // Food / Food Grade, Non-Food, etc.
  pictureUrl: string;
  attachmentUrl?: string;

  // Section B: Product Details
  productionDate?: Date;
  expiryDate?: Date;
  batchNo?: string;
  nafdacNo?: string;

  // Section C: Receipt & Dispatch Tracking
  dateOfEntry: Date;
  analysisRequired: string[]; // Multi-select array
  receivingLabId: string; // LAB_1, LAB_2
  receivingLabName: string;
  processingDate?: Date; // Set when Lab confirms receipt
  sentBy: string;

  // Section D: Finance & Documentation
  invoiceNo?: string;
  invoiceAmount?: string;
  invoiceFileUrl?: string;
  invoiceAcknowledged: boolean;
  receiptNo?: string;
  receiptFileUrl?: string;
  paymentConfirmedByLab?: boolean;
  resultStatus: ResultStatusType;
  resultFileUrl?: string;
  resultComments?: string;

  // Workflow & Management
  workflowStatus: WorkflowStatusType;
  statusHistory: IStatusHistory[];
  comments: IComment[];

  // Analytics
  turnaroundTimeDays?: number; // Days from processingDate to Result Received/Completed
  reminderSentAt?: Date;
  tatNoticeSentAt?: Date;
  cannotPerformTestReason?: string;
  resultDiscrepancyNote?: string;
  resultDiscrepancyFileUrl?: string;
  rejectionReason?: string;
  rejectedAt?: Date;
  rejectedBy?: string;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  deletionReason?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    message: { type: String, required: true },
    attachmentUrl: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const StatusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    changedBy: { type: String, required: true },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SampleSchema: Schema = new Schema(
  {
    // Section A
    sampleName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    sampleCode: { type: String, required: true, unique: true, index: true },
    sampleNature: { type: String, required: true },
    pictureUrl: { type: String, required: true },
    attachmentUrl: { type: String, default: null },

    // Section B
    productionDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    batchNo: { type: String, default: '' },
    nafdacNo: { type: String, default: '' },

    // Section C
    dateOfEntry: { type: Date, required: true, default: Date.now },
    analysisRequired: { type: [String], required: true },
    receivingLabId: { type: String, required: true }, // e.g. "LAB_1", "LAB_2"
    receivingLabName: { type: String, required: true },
    processingDate: { type: Date, default: null },
    sentBy: { type: String, required: true },

    // Section D
    invoiceNo: { type: String, default: '' },
    invoiceAmount: { type: String, default: '' },
    invoiceFileUrl: { type: String, default: null },
    invoiceAcknowledged: { type: Boolean, default: false },
    receiptNo: { type: String, default: '' },
    receiptFileUrl: { type: String, default: null },
    paymentConfirmedByLab: { type: Boolean, default: false },
    resultStatus: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Rejected'],
      default: 'Pending',
    },
    resultFileUrl: { type: String, default: null },
    resultComments: { type: String, default: '' },

    // Workflow
    workflowStatus: {
      type: String,
      enum: ['Received', 'Registered', 'Sent to Lab', 'In Processing', 'Result Received', 'Closed', 'Rejected'],
      default: 'Registered',
    },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    comments: { type: [CommentSchema], default: [] },

    turnaroundTimeDays: { type: Number, default: null },
    reminderSentAt: { type: Date, default: null },
    tatNoticeSentAt: { type: Date, default: null },
    cannotPerformTestReason: { type: String, default: null },
    resultDiscrepancyNote: { type: String, default: null },
    resultDiscrepancyFileUrl: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: null },

    // Soft delete / Deleted Bin (Super Admin only)
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
    deletionReason: { type: String, default: null },
  },
  { timestamps: true }
);

export const Sample = mongoose.model<ISample>('Sample', SampleSchema);

