import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const adopterApp = exp.Router();

const getAnimals = () => mongoose.connection.db.collection("animals");
const getUsers = () => mongoose.connection.db.collection("users");
const getNotifications = () => mongoose.connection.db.collection("notifications");

// ✅ POST - Apply for adoption (WITH PROPER AUTH)
adopterApp.post("/apply/:animalId", verifyToken(), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const userId = req.user.id;
    
    console.log("\n🏠 [ADOPTION] === Application Started ===");
    console.log("  - Animal ID:", animalId);
    console.log("  - User ID:", userId);
    console.log("  - User Role:", req.user.role);
    
    // Check if user is an adopter
    if (req.user.role !== "ADOPTER") {
      return res.status(403).json({ message: "Only adopters can apply for adoption" });
    }
    
    // Validate animal ID
    if (!animalId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid animal ID format" });
    }
    
    // Find the animal
    const animal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(animalId) });
    
    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }
    
    console.log("  - Animal name:", animal.name);
    console.log("  - Animal status:", animal.status);
    
    // Check if animal is available for adoption
    if (animal.status !== "Adoption Pending" && animal.status !== "Rescued") {
      return res.status(400).json({ message: "This animal is not available for adoption" });
    }
    
    // Check if user already applied
    if (animal.adoption?.applicant?.toString() === userId) {
      return res.status(400).json({ message: "You have already applied for this animal" });
    }
    
    // Check if there's already an applicant
    if (animal.adoption?.applicant) {
      return res.status(400).json({ message: "This animal already has an adoption application" });
    }
    
    // Get adopter info
    const adopter = await getUsers().findOne({ _id: new mongoose.Types.ObjectId(userId) });
    const adopterName = adopter ? `${adopter.firstName} ${adopter.lastName}` : "Someone";
    
    // Update animal with adoption application
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(animalId) },
      {
        $set: {
          "adoption.applicant": new mongoose.Types.ObjectId(userId),
          "adoption.applicationDate": new Date(),
          "adoption.status": "Pending",
          status: "Adoption Pending"
        }
      }
    );
    
    console.log("✅ [ADOPTION] Application saved to database");
    
    // ✅ NOTIFY THE ASSIGNED VOLUNTEER
    if (animal.assignedVolunteer) {
      try {
        await getNotifications().insertOne({
          userId: new mongoose.Types.ObjectId(animal.assignedVolunteer.toString()),
          type: "adoption",
          title: "New Adoption Application",
          message: `${adopterName} applied to adopt ${animal.name || "this animal"}.`,
          link: `/case/${animalId}?review=application`,
          read: false,
          createdAt: new Date()
        });
        console.log("✅ [ADOPTION] Volunteer notified successfully");
      } catch (notifErr) {
        console.warn("⚠️ [ADOPTION] Notification failed (non-critical):", notifErr.message);
      }
    } else {
      console.log("⚠️ [ADOPTION] No volunteer assigned - skipping notification");
    }
    
    console.log("✅ [ADOPTION] === Application Complete ===\n");
    
    res.status(201).json({ 
      message: "Adoption application submitted successfully!", 
      payload: { animalId, applicant: userId }
    });
  } catch (err) {
    console.error("\n💥 [ADOPTION] === CRITICAL ERROR ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    console.error("================================\n");
    
    res.status(500).json({ 
      message: "Failed to submit application", 
      error: err.message 
    });
  }
});

// ✅ GET - My adoption applications
adopterApp.get("/my-applications", verifyToken(), async (req, res, next) => {
  try {
    if (req.user.role !== "ADOPTER") {
      return res.status(403).json({ message: "Only adopters can view applications" });
    }
    
    const applications = await getAnimals()
      .find({ "adoption.applicant": new mongoose.Types.ObjectId(req.user.id) })
      .sort({ "adoption.applicationDate": -1 })
      .toArray();
    
    res.status(200).json({ message: "My applications fetched", payload: applications });
  } catch (err) {
    console.error("My applications error:", err);
    next(err);
  }
});

// ✅ GET - Stats for adopter dashboard
adopterApp.get("/stats", verifyToken(), async (req, res, next) => {
  try {
    if (req.user.role !== "ADOPTER") {
      return res.status(403).json({ message: "Only adopters can view stats" });
    }
    
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const myApplications = await getAnimals()
      .find({ "adoption.applicant": userId })
      .toArray();
    
    const stats = {
      total: myApplications.length,
      pending: myApplications.filter(a => a.adoption?.status === "Pending").length,
      approved: myApplications.filter(a => a.adoption?.status === "Approved").length,
      rejected: myApplications.filter(a => a.adoption?.status === "Rejected").length
    };
    
    res.status(200).json({ message: "Stats fetched", payload: stats });
  } catch (err) { next(err); }
});