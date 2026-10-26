import mongoose from 'mongoose';

// An uploaded image, as stored by utils/uploads.js. The field is called
// `type`, so it needs the long form or Mongoose reads it as the path's type.
export const imageSchema = new mongoose.Schema(
  { file: String, name: String, type: { type: String }, size: Number },
  { _id: false },
);
