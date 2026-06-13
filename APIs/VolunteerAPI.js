import exp from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { verifyToken } from "../middlewares/verifyToken.js";

export const volunteerApp = exp.Router();

// ✅ Ensure uploads directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `rescue-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const getAnimals = () => mongoose.connection.db.collection("animals");
const getUsers = () => mongoose.connection.db.collection("users");
const getNotifications = () => mongoose.connection.db.collection("notifications");

// ✅ GET pending cases
volunteerApp.get("/pending", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const pendingCases = await getAnimals().find({ status: "Pending", assignedVolunteer: { $exists: false } }).toArray();
    res.status(200).json({ message: "Pending cases fetched", payload: pendingCases });
  } catch (err) { next(err); }
});

// ✅ GET my active cases
volunteerApp.get("/my-cases", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const myCases = await getAnimals()
      .find({ 
        assignedVolunteer: new mongoose.Types.ObjectId(req.user.id),
        status: { $in: ["In Transit", "Rescued", "Adoption Pending"] }
      })
      .toArray();
    res.status(200).json({ message: "My cases fetched", payload: myCases });
  } catch (err) { next(err); }
});

// ✅ GET my completed cases
volunteerApp.get("/completed-cases", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const completedCases = await getAnimals()
      .find({ 
        assignedVolunteer: new mongoose.Types.ObjectId(req.user.id),
        status: "Adopted"
      })
      .toArray();
    res.status(200).json({ message: "Completed cases fetched", payload: completedCases });
  } catch (err) { next(err); }
});

// ✅ PUT accept a case
volunteerApp.put("/accept/:id", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const { id } = req.params;
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { assignedVolunteer: new mongoose.Types.ObjectId(req.user.id), status: "In Transit" } }
    );
    res.status(200).json({ message: "Case accepted successfully" });
  } catch (err) { next(err); }
});

// ✅ PUT update case status
volunteerApp.put("/update-status/:id", verifyToken("VOLUNTEER"), upload.single("rescueImage"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, description } = req.body;
    
    const updateData = { status, updatedAt: new Date() };
    if (description) updateData.description = description;
    if (req.file) updateData.imageUrl = `http://localhost:12000/uploads/${req.file.filename}`;

    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData }
    );
    res.status(200).json({ message: "Status updated successfully" });
  } catch (err) { next(err); }
});

// ✅ POST upload receipts
volunteerApp.post("/receipts/:id", verifyToken("VOLUNTEER"), upload.array("receipts", 5), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { titles } = req.body;
    
    const receiptData = (req.files || []).map((file, index) => ({
      url: `http://localhost:12000/uploads/${file.filename}`,
      title: Array.isArray(titles) ? titles[index] : (titles || `Receipt ${index + 1}`),
      uploadedAt: new Date()
    }));

    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $push: { receipts: { $each: receiptData } } }
    );
    res.status(200).json({ message: "Receipts uploaded successfully" });
  } catch (err) { next(err); }
});

// ✅ POST complete adoption (legacy fallback)
volunteerApp.post("/animals/:id/complete-adoption", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const { id } = req.params;
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { status: "Adopted", "adoption.status": "Approved", "adoption.approvedDate": new Date() } }
    );
    res.status(200).json({ message: "Adoption completed successfully" });
  } catch (err) { next(err); }
});

// ==========================================
// ✅ APPROVE ADOPTION APPLICATION
// ==========================================
volunteerApp.post("/approve-adoption/:animalId", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const volunteerId = req.user.id;
    
    console.log("\n✅ [APPROVAL] Approving adoption for:", animalId);
    
    const animal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(animalId) });
    
    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }
    
    if (!animal.adoption?.applicant) {
      return res.status(400).json({ message: "No adoption application found" });
    }
    
    // Update animal status to Adopted
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(animalId) },
      {
        $set: {
          status: "Adopted",
          "adoption.status": "Approved",
          "adoption.approvedDate": new Date(),
          "adoption.approvedBy": new mongoose.Types.ObjectId(volunteerId)
        }
      }
    );
    
    // Notify the adopter
    try {
      const adopterId = animal.adoption.applicant.toString();
      const adopter = await getUsers().findOne({ _id: new mongoose.Types.ObjectId(adopterId) });
      const adopterName = adopter ? `${adopter.firstName} ${adopter.lastName}` : "the adopter";
      
      await getNotifications().insertOne({
        userId: new mongoose.Types.ObjectId(adopterId),
        type: "adoption",
        title: "Adoption Approved! 🎉",
        message: `Congratulations! Your application to adopt ${animal.name || "this animal"} has been approved.`,
        link: `/case/${animalId}`, // ✅ FIXED: Removed ?review=application
        read: false,
        createdAt: new Date()
      });
      console.log("✅ [APPROVAL] Adopter notified successfully");
    } catch (notifErr) {
      console.warn("⚠️ [APPROVAL] Failed to send notification (non-critical):", notifErr.message);
    }
    
    console.log("✅ [APPROVAL] Adoption approved successfully\n");
    
    res.status(200).json({ 
      message: "Adoption approved successfully!", 
      payload: { animalId, status: "Adopted" }
    });
  } catch (err) {
    console.error("\n💥 [APPROVAL] === CRITICAL ERROR ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    console.error("================================\n");
    next(err);
  }
});

// ==========================================
// ✅ REJECT ADOPTION APPLICATION
// ==========================================
volunteerApp.post("/reject-adoption/:animalId", verifyToken("VOLUNTEER"), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const { reason } = req.body;
    const volunteerId = req.user.id;
    
    console.log("\n❌ [REJECTION] Rejecting adoption for:", animalId);
    
    const animal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(animalId) });
    
    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }
    
    if (!animal.adoption?.applicant) {
      return res.status(400).json({ message: "No adoption application found" });
    }
    
    const adopterId = animal.adoption.applicant.toString();
    
    // Notify the adopter BEFORE we wipe the applicant data
    try {
      const adopter = await getUsers().findOne({ _id: new mongoose.Types.ObjectId(adopterId) });
      await getNotifications().insertOne({
        userId: new mongoose.Types.ObjectId(adopterId),
        type: "adoption",
        title: "Adoption Application Update",
        message: `Your application to adopt ${animal.name || "this animal"} was not approved. ${reason ? `Reason: ${reason}` : "Please check with the volunteer for more details."}`,
        link: `/case/${animalId}`,
        read: false,
        createdAt: new Date()
      });
      console.log("✅ [REJECTION] Adopter notified");
    } catch (notifErr) {
      console.warn("⚠️ [REJECTION] Failed to send notification:", notifErr.message);
    }
    
    // Update animal - remove applicant, set status back to Adoption Pending
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(animalId) },
      {
        $set: {
          status: "Adoption Pending",
          "adoption.status": "Rejected",
          "adoption.rejectedDate": new Date(),
          "adoption.rejectedBy": new mongoose.Types.ObjectId(volunteerId),
          "adoption.rejectionReason": reason || ""
        },
        $unset: {
          "adoption.applicant": "",
          "adoption.applicationDate": "",
          "adoption.message": "",
          "adoption.experience": "",
          "adoption.livingSituation": "",
          "adoption.otherPets": ""
        }
      }
    );
    
    console.log("✅ [REJECTION] Adoption rejected successfully\n");
    
    res.status(200).json({ 
      message: "Adoption rejected successfully!", 
      payload: { animalId, status: "Adoption Pending" }
    });
  } catch (err) {
    console.error("\n💥 [REJECTION] === CRITICAL ERROR ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    console.error("================================\n");
    next(err);
  }
});