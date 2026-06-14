import exp from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middlewares/verifyToken.js";

export const reporterApp = exp.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `animal-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const getAnimals = () => mongoose.connection.db.collection("animals");

// ✅ POST - Report a new animal
reporterApp.post("/report", verifyToken("REPORTER"), upload.single("image"), async (req, res, next) => {
  try {
    console.log("\n📝 [REPORT] === New Report Submitted ===");
    console.log("📝 [REPORT] User ID from token:", req.user.id);
    
    const { name, species, breed, description, urgency, address, location, latitude, longitude, caseType } = req.body;
    const finalAddress = address || location;

    if (!species || species.trim() === "") {
      return res.status(400).json({ message: "Species is required" });
    }
    if (!description || description.trim() === "") {
      return res.status(400).json({ message: "Description is required" });
    }
    if (!finalAddress || finalAddress.trim() === "") {
      return res.status(400).json({ message: "Address is required" });
    }

        // ✅ Declare backendUrl BEFORE the object
    const backendUrl = process.env.BACKEND_URL || "http://localhost:12000";

    const newAnimal = {
      name: name?.trim() || "Unnamed",
      species: species.trim(),
      breed: breed?.trim() || "",
      description: description.trim(),
      caseType: caseType || "Stray",
      urgency: urgency === "true" || urgency === true || urgency === "on",
      imageUrl: req.file ? `${backendUrl}/uploads/${req.file.filename}` : null,  // ✅ Now it works
    // const newAnimal = {
    //   name: name?.trim() || "Unnamed",
    //   species: species.trim(),
    //   breed: breed?.trim() || "",
    //   description: description.trim(),
    //   caseType: caseType || "Stray", // ✅ NEW: Case type (Stray or Lost)
    //   urgency: urgency === "true" || urgency === true || urgency === "on",
    //  const backendUrl = process.env.BACKEND_URL || "http://localhost:12000";
    // imageUrl: req.file ? `${backendUrl}/uploads/${req.file.filename}` : null,
      location: {
        address: finalAddress.trim(),
        coordinates: latitude && longitude 
          ? { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] }
          : null
      },
      status: "Pending",
      visibility: "private",
      reportedBy: new mongoose.Types.ObjectId(req.user.id),
      donations: [],
      totalPledged: 0,
      receipts: [],
      helpActions: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await getAnimals().insertOne(newAnimal);
    newAnimal._id = result.insertedId;

    console.log("✅ [REPORT] Successfully created with ID:", newAnimal._id);
    console.log("===========================================\n");

    res.status(201).json({ 
      message: "Animal reported successfully!", 
      payload: newAnimal 
    });
  } catch (err) {
    console.error("💥 [REPORT] Error:", err);
    next(err);
  }
});

// ✅ GET - My reports (UPDATED TO RETURN BOTH ANIMALS AND STATS)
reporterApp.get("/my-reports", verifyToken("REPORTER"), async (req, res, next) => {
  try {
    console.log("\n📋 [MY REPORTS] === Fetching Reports ===");
    console.log("📋 [MY REPORTS] User ID from token:", req.user.id);
    
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    const reports = await getAnimals()
      .find({ reportedBy: userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Calculate stats
    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === "Pending").length,
      inTransit: reports.filter(r => r.status === "In Transit").length,
      rescued: reports.filter(r => r.status === "Rescued").length,
      adopted: reports.filter(r => r.status === "Adopted").length
    };

    console.log("📋 [MY REPORTS] Found", reports.length, "reports");
    console.log("📋 [MY REPORTS] Stats:", stats);
    console.log("===========================================\n");

    // ✅ Return both animals and stats in payload
    res.status(200).json({ 
      message: "My reports fetched", 
      payload: {
        animals: reports,
        stats: stats
      }
    });
  } catch (err) {
    console.error("💥 [MY REPORTS] Error:", err);
    next(err);
  }
});

// ✅ GET - Stats (kept for backward compatibility)
reporterApp.get("/stats", verifyToken("REPORTER"), async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const myReports = await getAnimals().find({ reportedBy: userId }).toArray();

    const stats = {
      total: myReports.length,
      pending: myReports.filter(r => r.status === "Pending").length,
      inTransit: myReports.filter(r => r.status === "In Transit").length,
      rescued: myReports.filter(r => r.status === "Rescued").length,
      adopted: myReports.filter(r => r.status === "Adopted").length
    };

    res.status(200).json({ message: "Stats fetched", payload: stats });
  } catch (err) { next(err); }
});