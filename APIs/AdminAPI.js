import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const adminApp = exp.Router();

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ message: "Admin access required" });
  next();
};

// ✅ GET Dashboard Stats
adminApp.get("/stats", verifyToken(), isAdmin, async (req, res, next) => {
  try {
    const users = await mongoose.connection.db.collection("users").countDocuments();
    const animals = await mongoose.connection.db.collection("animals").countDocuments();
    const adopted = await mongoose.connection.db.collection("animals").countDocuments({ status: "Adopted" });
    
    const donationPipeline = [{ $unwind: "$donations" }, { $group: { _id: null, total: { $sum: "$donations.amount" } } }];
    const donationResult = await mongoose.connection.db.collection("animals").aggregate(donationPipeline).toArray();
    const totalDonations = donationResult[0]?.total || 0;

    res.status(200).json({ message: "Stats fetched", payload: { users, animals, adopted, totalDonations } });
  } catch (err) { next(err); }
});

// ✅ GET All Users
adminApp.get("/users", verifyToken(), isAdmin, async (req, res, next) => {
  try {
    const users = await mongoose.connection.db.collection("users").find({}, { projection: { password: 0 } }).toArray();
    res.status(200).json({ message: "Users fetched", payload: users });
  } catch (err) { next(err); }
});

// ✅ PUT Toggle User Active Status
adminApp.put("/users/:id/toggle-status", verifyToken(), isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await mongoose.connection.db.collection("users").findOne({ _id: new mongoose.Types.ObjectId(id) });
    const newStatus = !user.isUserActive;
    
    await mongoose.connection.db.collection("users").updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { isUserActive: newStatus } }
    );
    res.status(200).json({ message: `User ${newStatus ? "activated" : "deactivated"}` });
  } catch (err) { next(err); }
});