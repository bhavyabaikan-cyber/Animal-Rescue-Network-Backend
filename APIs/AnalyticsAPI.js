import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const analyticsApp = exp.Router();
const isAdmin = (req, res, next) => {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ message: "Admin access required" });
  next();
};

const getAnimals = () => mongoose.connection.db.collection("animals");
const getUsers = () => mongoose.connection.db.collection("users");

analyticsApp.get("/dashboard", verifyToken(), isAdmin, async (req, res, next) => {
  try {
    const animals = await getAnimals().find({}).toArray();
    const users = await getUsers().find({}, { projection: { password: 0 } }).toArray();

    const statusDistribution = {};
    animals.forEach(a => { statusDistribution[a.status] = (statusDistribution[a.status] || 0) + 1; });

    const speciesDistribution = {};
    animals.forEach(a => { const species = a.species || "Unknown"; speciesDistribution[species] = (speciesDistribution[species] || 0) + 1; });

    const monthlyTrends = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(); date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = animals.filter(a => { const created = new Date(a.createdAt); return created >= monthStart && created <= monthEnd; }).length;
      monthlyTrends.push({ month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), count });
    }

    const allDonations = [];
    animals.forEach(a => { (a.donations || []).forEach(d => { allDonations.push({ ...d, date: d.createdAt }); }); });

    const monthlyDonations = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(); date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const total = allDonations.filter(d => new Date(d.date) >= monthStart && new Date(d.date) <= monthEnd).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      monthlyDonations.push({ month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), amount: total });
    }

    const roleDistribution = {};
    users.forEach(u => { roleDistribution[u.role] = (roleDistribution[u.role] || 0) + 1; });

    const locations = animals.filter(a => a.location?.coordinates?.coordinates).map(a => ({
      lat: a.location.coordinates.coordinates[1], lng: a.location.coordinates.coordinates[0], name: a.name, status: a.status
    }));

    const totalDonations = allDonations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const avgDonation = allDonations.length > 0 ? totalDonations / allDonations.length : 0;
    const adoptionRate = animals.length > 0 ? Math.round((animals.filter(a => a.status === "Adopted").length / animals.length) * 100) : 0;

    res.status(200).json({
      message: "Analytics fetched",
      payload: {
        statusDistribution, speciesDistribution, monthlyTrends, monthlyDonations, roleDistribution, locations,
        metrics: {
          totalAnimals: animals.length, totalUsers: users.length, totalDonations,
          totalDonors: allDonations.length, avgDonation: Math.round(avgDonation),
          adoptionRate, adopted: animals.filter(a => a.status === "Adopted").length,
          pending: animals.filter(a => a.status === "Pending").length
        }
      }
    });
  } catch (err) { next(err); }
});