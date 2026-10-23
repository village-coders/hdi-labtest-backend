import mongoose, { Schema, Document } from 'mongoose';

export interface ICounter extends Document {
  key: string; // e.g. "FD_10_26"
  seq: number;
}

const CounterSchema: Schema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounter>('Counter', CounterSchema);
