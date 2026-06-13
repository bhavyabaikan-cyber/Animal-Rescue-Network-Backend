import { Schema, model, Types } from "mongoose";

const donationSchema = new Schema({
  donor: { type: Types.ObjectId, ref: "user" },
  amount: { type: Number, default: 0 },
  message: { type: String, default: "" },
  paymentId: { type: String, default: "" },
  orderId: { type: String, default: "" },
}, { timestamps: true, versionKey: false });

const receiptSchema = new Schema({
  volunteer: { type: Types.ObjectId, ref: "user" },
  imageUrl: { type: String, default: "" },
  title: { type: String, default: "Receipt" },
  amount: { type: Number, default: 0 },
  ocrText: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const AnimalSchema = new Schema({
  reportedBy: { type: Types.ObjectId, ref: "user", required: true },
  name: { type: String, default: "Unnamed" },
  species: { type: String, required: true },
  
  // ✅ THIS IS THE MAGIC FIX: Mixed accepts strings OR objects
  location: { type: Schema.Types.Mixed, default: "Unknown Location" },
  
  contactNumber: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, default: "" },
  status: { type: String, enum: ["Pending", "In Transit", "Rescued", "Adoption Pending", "Adopted"], default: "Pending" },
  urgency: { type: Boolean, default: false },
  assignedVolunteer: { type: Types.ObjectId, ref: "user" },
  donations: { type: [donationSchema], default: [] },
  totalPledged: { type: Number, default: 0 },
  helpActions: { type: Array, default: [] },
  visibility: { type: String, enum: ["private", "public"], default: "public" },
  receipts: { type: [receiptSchema], default: [] },
  adoption: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false, strict: false }); // strict: false is critical

// Geospatial index (won't break on strings)
AnimalSchema.index({ "location.coordinates": "2dsphere" });

export const AnimalModel = model("animal", AnimalSchema);