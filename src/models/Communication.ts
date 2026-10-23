import mongoose, { Schema, Document } from 'mongoose';

export interface ICommunication extends Document {
  labIdentifier: string;
  labName: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderEmail: string;
  subject?: string;
  message: string;
  sampleCode?: string;
  priority: 'NORMAL' | 'URGENT' | 'HIGH';
  status: 'OPEN' | 'RESOLVED';
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationSchema = new Schema(
  {
    labIdentifier: { type: String, required: true, index: true },
    labName: { type: String, default: '' },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    senderEmail: { type: String, default: '' },
    subject: { type: String, default: 'General Communication' },
    message: { type: String, required: true },
    sampleCode: { type: String, default: '' },
    priority: { type: String, enum: ['NORMAL', 'URGENT', 'HIGH'], default: 'NORMAL' },
    status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' },
  },
  { timestamps: true }
);

export const Communication = mongoose.model<ICommunication>('Communication', CommunicationSchema);
