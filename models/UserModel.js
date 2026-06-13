import { Schema, model } from "mongoose";
const UserSchema = new Schema({
  firstName: { type: String, required: [true, "First name is required"], trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, required: [true, "Email is required"], unique: true, trim: true, lowercase: true },
  password: { type: String, required: [true, "Password required"] },
  role: { type: String, enum: ["USER", "REPORTER", "VOLUNTEER", "DONOR", "ADMIN", "ADOPTER"], required: [true, "Invalid role"] },
  profileImageUrl: { type: String, trim: true },
  isUserActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false, strict: "throw" });
export const UserModel = model("user", UserSchema);