import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'REGISTRY' | 'QA' | 'FINANCE' | 'MANAGEMENT' | 'LAB_USER';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  labIdentifier?: string; // LAB_1, LAB_2
  labName?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'REGISTRY', 'QA', 'FINANCE', 'MANAGEMENT', 'LAB_USER'],
      default: 'ADMIN',
    },
    labIdentifier: { type: String, enum: ['LAB_1', 'LAB_2', 'LAB_3', 'LAB_4', null], default: null },
    labName: { type: String, default: null },
    phone: { type: String, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
