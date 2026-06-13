import { Schema, model, Types } from "mongoose";

const AdoptionApplicationSchema = new Schema({
  animal: { type: Types.ObjectId, ref: "animal", required: true },
  applicant: { type: Types.ObjectId, ref: "user", required: true },
  housingType: { type: String, enum: ["Apartment", "House with Yard", "House without Yard", "Other"], required: true },
  hasOtherPets: { type: Boolean, default: false },
  petExperience: { type: String, required: true, trim: true },
  reasonForAdoption: { type: String, required: true, trim: true },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  reviewNotes: { type: String, default: "", trim: true }, // Notes from volunteer/admin
  reviewedBy: { type: Types.ObjectId, ref: "user" },
}, { timestamps: true, versionKey: false });

export const AdoptionApplicationModel = model("adoptionApplication", AdoptionApplicationSchema);