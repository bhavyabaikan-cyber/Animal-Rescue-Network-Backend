import exp from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middlewares/verifyToken.js";

export const userApp = exp.Router();

// ✅ Ensure uploads/profiles directory exists
const uploadDir = "uploads/profiles";
import fs from "fs";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `profile-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

const getUsers = () => mongoose.connection.db.collection("users");

// ✅ GET current user profile
userApp.get("/profile", verifyToken(), async (req, res, next) => {
  try {
    const user = await getUsers().findOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      { projection: { password: 0 } }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.status(200).json({ 
      message: "Profile fetched", 
      payload: user 
    });
  } catch (err) {
    console.error("Get profile error:", err);
    next(err);
  }
});

// ✅ GET user profile by ID (for viewing other users' profiles)
userApp.get("/profile/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    if (!userId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }
    
    const user = await getUsers().findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { password: 0 } }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.status(200).json({ 
      message: "User profile fetched", 
      payload: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profileImageUrl: user.profileImageUrl
      }
    });
  } catch (err) {
    console.error("Get user profile error:", err);
    next(err);
  }
});

// ✅ PUT update user profile
userApp.put("/profile", verifyToken(), upload.single("profileImage"), async (req, res, next) => {
  try {
    const { firstName, lastName, email } = req.body;
    const updateData = {};
    
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (req.file) {
      updateData.profileImageUrl = `http://localhost:12000/uploads/profiles/${req.file.filename}`;
    }
    
    await getUsers().updateOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      { $set: updateData }
    );
    
    const updatedUser = await getUsers().findOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      { projection: { password: 0 } }
    );
    
    res.status(200).json({ 
      message: "Profile updated successfully", 
      payload: updatedUser 
    });
  } catch (err) {
    console.error("Update profile error:", err);
    next(err);
  }
});

// ✅ PUT change password
userApp.put("/password", verifyToken(), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Import bcrypt dynamically to avoid circular dependencies
    const bcrypt = await import("bcrypt");
    
    const user = await getUsers().findOne({ _id: new mongoose.Types.ObjectId(req.user.id) });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const isMatch = await bcrypt.default.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    
    const hashedPassword = await bcrypt.default.hash(newPassword, 10);
    
    await getUsers().updateOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      { $set: { password: hashedPassword } }
    );
    
    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    next(err);
  }
});

// ✅ GET all users (for admin or messaging)
userApp.get("/all", verifyToken(), async (req, res, next) => {
  try {
    const users = await getUsers().find(
      {},
      { projection: { password: 0 } }
    ).toArray();
    
    res.status(200).json({ 
      message: "Users fetched", 
      payload: users 
    });
  } catch (err) {
    console.error("Get all users error:", err);
    next(err);
  }
});