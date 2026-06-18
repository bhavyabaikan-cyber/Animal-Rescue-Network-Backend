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
updateData.profileImageUrl = `${process.env.BACKEND_URL || "http://localhost:12000"}/uploads/profiles/${req.file.filename}`;    }
    
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

// ✅ GET Dynamic Badges based on user activity
userApp.get("/badges", verifyToken(), async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await getUsers().findOne({ _id: userId });
    const animals = mongoose.connection.db.collection("animals");
    
    const badges = [];

    // 1. Common Badge (Everyone gets this)
    badges.push({ id: 'joined', title: 'Community Member', description: 'Joined the Animal Rescue Network', icon: '🌟' });

    // 2. Reporter Badges
    if (user.role === 'REPORTER') {
      const reported = await animals.find({ reportedBy: userId }).toArray();
      if (reported.length >= 1) badges.push({ id: 'first_report', title: 'First Responder', description: 'Reported your first animal in need', icon: '📢' });
      if (reported.length >= 5) badges.push({ id: 'watchful_eye', title: 'Watchful Eye', description: 'Reported 5 animals', icon: '👁️' });
      
      const rescued = reported.filter(a => a.status === 'Rescued' || a.status === 'Adopted');
      if (rescued.length >= 1) badges.push({ id: 'lifesaver', title: 'Lifesaver', description: 'Reported an animal that was successfully rescued', icon: '🏆' });
    }

    // 3. Volunteer Badges
    if (user.role === 'VOLUNTEER') {
      const assigned = await animals.find({ assignedVolunteer: userId }).toArray();
      if (assigned.length >= 1) badges.push({ id: 'first_rescue', title: 'Action Hero', description: 'Accepted your first rescue case', icon: '🦸' });
      if (assigned.length >= 5) badges.push({ id: 'veteran', title: 'Veteran Rescuer', description: 'Handled 5 rescue cases', icon: '🎖️' });
      
      const adopted = assigned.filter(a => a.status === 'Adopted');
      if (adopted.length >= 1) badges.push({ id: 'matchmaker', title: 'Matchmaker', description: 'Helped an animal find a forever home', icon: '🏡' });
    }

    // 4. Donor Badges
    if (user.role === 'DONOR') {
      const donatedCases = await animals.find({ "donations.donor": userId }).toArray();
      let totalDonated = 0;
      donatedCases.forEach(a => {
        a.donations.filter(d => d.donor.toString() === userId.toString()).forEach(d => totalDonated += Number(d.amount) || 0);
      });
      
      if (donatedCases.length >= 1) badges.push({ id: 'first_donation', title: 'Generous Heart', description: 'Made your first donation', icon: '💖' });
      if (totalDonated >= 1000) badges.push({ id: 'champion', title: 'Champion Supporter', description: 'Donated over ₹1000', icon: '👑' });
      if (totalDonated >= 5000) badges.push({ id: 'philanthropist', title: 'Philanthropist', description: 'Donated over ₹5000', icon: '💎' });
    }

    // 5. Adopter Badges
    if (user.role === 'ADOPTER') {
      const adopted = await animals.find({ 'adoption.applicant': userId, status: 'Adopted' }).toArray();
      const applied = await animals.find({ 'adoption.applicant': userId }).toArray();
      
      if (applied.length >= 1 && adopted.length === 0) badges.push({ id: 'hopeful', title: 'Hopeful Adopter', description: 'Submitted an adoption application', icon: '📝' });
      if (adopted.length >= 1) badges.push({ id: 'forever_home', title: 'Forever Home', description: 'Successfully adopted an animal', icon: '🐾' });
    }

    res.status(200).json({ message: "Badges fetched", payload: badges });
  } catch (err) {
    console.error("Badges error:", err);
    next(err);
  }
});

// ✅ GET user points
userApp.get("/points", verifyToken(), async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const user = await getUsers().findOne({ _id: userId });
    const animals = mongoose.connection.db.collection("animals");
    
    let points = 0;
    const breakdown = [];

    // 1. Base points for joining
    points += 10;
    breakdown.push({ action: "Joined the community", points: 10 });

    // 2. Reporter points
    if (user.role === 'REPORTER') {
      const reported = await animals.find({ reportedBy: userId }).toArray();
      const reportPoints = reported.length * 20;
      points += reportPoints;
      if (reported.length > 0) breakdown.push({ action: `Reported ${reported.length} animal(s)`, points: reportPoints });
      
      const rescued = reported.filter(a => a.status === 'Rescued' || a.status === 'Adopted');
      const rescuePoints = rescued.length * 50;
      points += rescuePoints;
      if (rescued.length > 0) breakdown.push({ action: `${rescued.length} animal(s) rescued`, points: rescuePoints });
    }

    // 3. Volunteer points
    if (user.role === 'VOLUNTEER') {
      const assigned = await animals.find({ assignedVolunteer: userId }).toArray();
      const casePoints = assigned.length * 30;
      points += casePoints;
      if (assigned.length > 0) breakdown.push({ action: `Handled ${assigned.length} case(s)`, points: casePoints });
      
      const adopted = assigned.filter(a => a.status === 'Adopted');
      const adoptionPoints = adopted.length * 100;
      points += adoptionPoints;
      if (adopted.length > 0) breakdown.push({ action: `${adopted.length} successful adoption(s)`, points: adoptionPoints });
    }

    // 4. Donor points
    if (user.role === 'DONOR') {
      const donatedCases = await animals.find({ "donations.donor": userId }).toArray();
      let totalDonated = 0;
      donatedCases.forEach(a => {
        a.donations.filter(d => d.donor.toString() === userId.toString()).forEach(d => totalDonated += Number(d.amount) || 0);
      });
      
      const donationPoints = Math.floor(totalDonated / 10); // 1 point per ₹10
      points += donationPoints;
      if (totalDonated > 0) breakdown.push({ action: `Donated ₹${totalDonated}`, points: donationPoints });
    }

    // 5. Adopter points
    if (user.role === 'ADOPTER') {
      const adopted = await animals.find({ 'adoption.applicant': userId, status: 'Adopted' }).toArray();
      const adoptionPoints = adopted.length * 200;
      points += adoptionPoints;
      if (adopted.length > 0) breakdown.push({ action: `Adopted ${adopted.length} animal(s)`, points: adoptionPoints });
    }

    res.status(200).json({ 
      message: "Points fetched", 
      payload: { 
        totalPoints: points, 
        breakdown,
        level: getLevel(points)
      } 
    });
  } catch (err) {
    console.error("Points error:", err);
    next(err);
  }
});

// Helper function to determine level
function getLevel(points) {
  if (points >= 1000) return { name: "Legend", color: "#FFD700", icon: "👑" };
  if (points >= 500) return { name: "Hero", color: "#9333EA", icon: "🦸" };
  if (points >= 200) return { name: "Champion", color: "#3B82F6", icon: "🏆" };
  if (points >= 100) return { name: "Supporter", color: "#10B981", icon: "💚" };
  return { name: "Newcomer", color: "#6B7280", icon: "🌟" };
}