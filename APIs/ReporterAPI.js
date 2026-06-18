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


// ✅ PUT - Edit a reported animal (ONLY by the reporter who created it)
reporterApp.put("/report/:id", verifyToken("REPORTER"), upload.single("image"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log("\n✏️ [EDIT REPORT] === Editing Report ===");
    console.log("✏️ [EDIT REPORT] Animal ID:", id);
    console.log("✏️ [EDIT REPORT] User ID:", userId);

    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid animal ID format" });
    }

    // Find the animal
    const animal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    // ✅ SECURITY: Only the original reporter can edit
    if (animal.reportedBy.toString() !== userId) {
      return res.status(403).json({ message: "You can only edit your own reports" });
    }

    // Build update object with only provided fields
    const { name, species, breed, description, urgency, address, location, latitude, longitude, caseType } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name.trim() || "Unnamed";
    if (species !== undefined) {
      if (!species.trim()) return res.status(400).json({ message: "Species is required" });
      updateData.species = species.trim();
    }
    if (breed !== undefined) updateData.breed = breed.trim();
    if (description !== undefined) {
      if (!description.trim()) return res.status(400).json({ message: "Description is required" });
      updateData.description = description.trim();
    }
    if (urgency !== undefined) {
      updateData.urgency = urgency === "true" || urgency === true || urgency === "on";
    }
    if (caseType !== undefined) updateData.caseType = caseType;
    
    // Handle address/location
    const finalAddress = address || location;
    if (finalAddress !== undefined) {
      if (!finalAddress.trim()) return res.status(400).json({ message: "Address is required" });
      updateData["location.address"] = finalAddress.trim();
    }
    
    // Handle coordinates if provided
    if (latitude && longitude) {
      updateData["location.coordinates"] = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }

    // Handle new image upload
    if (req.file) {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:12000";
      updateData.imageUrl = `${backendUrl}/uploads/${req.file.filename}`;
    }

    updateData.updatedAt = new Date();

    // Update the animal
    await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData }
    );

    // Fetch updated animal
    const updatedAnimal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(id) });

    console.log("✅ [EDIT REPORT] Successfully updated\n");

    res.status(200).json({ 
      message: "Report updated successfully!", 
      payload: updatedAnimal 
    });
  } catch (err) {
    console.error("💥 [EDIT REPORT] Error:", err);
    next(err);
  }
});

// ✅ DELETE - Delete a reported animal (ONLY by the reporter who created it)
reporterApp.delete("/report/:id", verifyToken("REPORTER"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log("\n🗑️ [DELETE REPORT] === Deleting Report ===");
    console.log("🗑️ [DELETE REPORT] Animal ID:", id);
    console.log("🗑️ [DELETE REPORT] User ID:", userId);

    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid animal ID format" });
    }

    // Find the animal
    const animal = await getAnimals().findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    // ✅ SECURITY: Only the original reporter can delete
    if (animal.reportedBy.toString() !== userId) {
      return res.status(403).json({ message: "You can only delete your own reports" });
    }

    // ✅ Prevent deletion if case is already in progress
    if (animal.status !== "Pending") {
      return res.status(400).json({ 
        message: "Cannot delete this report. The case is already being handled by a volunteer." 
      });
    }

    // Delete the animal
    await getAnimals().deleteOne({ _id: new mongoose.Types.ObjectId(id) });

    console.log("✅ [DELETE REPORT] Successfully deleted\n");

    res.status(200).json({ 
      message: "Report deleted successfully!" 
    });
  } catch (err) {
    console.error("💥 [DELETE REPORT] Error:", err);
    next(err);
  }
});