import exp from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/UserModel.js";
import { AnimalModel } from "../models/AnimalModel.js";
import { verifyToken } from "../middlewares/verifyToken.js";

export const commonApp = exp.Router();

commonApp.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Use the SAME secret
    const secret = process.env.JWT_SECRET || "super_secret_fallback_key";
    
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role }, 
      secret, 
      { expiresIn: "24h" }
    );
    
    res.status(200).json({ 
      message: "Login successful", 
      token: token,
      payload: { 
        id: user._id.toString(), 
        email: user.email, 
        role: user.role, 
        firstName: user.firstName, 
        lastName: user.lastName 
      } 
    });
  } catch (err) { 
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ===== REGISTER (SIMPLE VERSION) =====
commonApp.post("/users", async (req, res) => {
  try {
    const { firstName, lastName, email, role, password } = req.body;
    
    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const newUser = await UserModel.create({ 
      firstName, 
      lastName, 
      email, 
      role, 
      password: hashed 
    });
    
    res.status(201).json({ 
      message: "User registered successfully", 
      payload: { 
        id: newUser._id, 
        email: newUser.email, 
        role: newUser.role, 
        firstName: newUser.firstName, 
        lastName: newUser.lastName 
      } 
    });
  } catch (err) { 
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ===== OTHER ROUTES =====
commonApp.get("/me", verifyToken(), async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select("-password");
    res.status(200).json({ 
      message: "User fetched", 
      payload: { 
        id: user._id, 
        email: user.email, 
        role: user.role, 
        firstName: user.firstName, 
        lastName: user.lastName 
      } 
    });
  } catch (err) { 
    res.status(500).json({ message: "Error", error: err.message });
  }
});

commonApp.get("/animals", async (req, res) => {
  try {
    const animals = await AnimalModel.find().sort({ createdAt: -1 });
    res.status(200).json({ message: "Animals fetched", payload: animals });
  } catch (err) { 
    res.status(500).json({ message: "Error", error: err.message });
  }
});

/// ✅ GET NEARBY ANIMALS (FOR MAP VIEW) - NOW INCLUDES ALL CASES
commonApp.get("/animals/nearby", async (req, res) => {
  try {
    const { lat, lng, radius, status } = req.query;
    
    // ✅ Base query: Get ALL animals (not just those with coordinates)
    let query = {};
    if (status && status !== "All") {
      query.status = status;
    }

    const animals = await AnimalModel.find(query).sort({ createdAt: -1 });

    // If lat/lng provided, filter by distance (only for animals WITH coordinates)
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadiusKm = parseFloat(radius) || 50;

      const filteredAnimals = animals.filter(animal => {
        // If animal has no coordinates, still include it (it will show in count but not on map)
        if (!animal.location?.coordinates?.coordinates) return true;
        
        const [aniLng, aniLat] = animal.location.coordinates.coordinates;
        
        // Haversine formula for distance in km
        const R = 6371; 
        const dLat = (aniLat - userLat) * Math.PI / 180;
        const dLng = (aniLng - userLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLat * Math.PI / 180) * Math.cos(aniLat * Math.PI / 180) * 
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return distance <= maxRadiusKm;
      });
      
      return res.status(200).json({ message: "Nearby animals fetched", payload: filteredAnimals });
    }

    res.status(200).json({ message: "All animals fetched", payload: animals });
  } catch (err) {
    console.error("Nearby animals error:", err);
    res.status(500).json({ message: "Error fetching nearby animals", error: err.message });
  }
});


// ✅ 3. GET SINGLE ANIMAL BY ID (SIMPLIFIED - ALLOW ALL LOGGED-IN USERS)
commonApp.get("/animals/:id", verifyToken(), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-f]{24}$/i)) return res.status(400).json({ message: "Invalid animal ID format" });
    
    const animal = await AnimalModel.findById(id)
      .populate("reportedBy", "firstName lastName email")
      .populate("assignedVolunteer", "firstName lastName email");
      
    if (!animal) return res.status(404).json({ message: "Animal not found" });
    
    // ✅ SIMPLIFIED: Any logged-in user can view any case
    // This allows donors to see cases, volunteers to collaborate, etc.
    return res.status(200).json({ message: "Animal fetched successfully", payload: animal });
    
  } catch (err) { 
    console.error("💥 [CASE] Error:", err);
    next(err); 
  }
});