import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const gamificationApp = exp.Router();

// Badge definitions
const BADGE_DEFINITIONS = [
  // Volunteer Badges
  { id: "first_rescue", name: "First Rescue", description: "Completed your first rescue", icon: "🏅", category: "VOLUNTEER", requirement: { type: "rescues", count: 1 } },
  { id: "ten_rescues", name: "Rescue Hero", description: "Completed 10 rescues", icon: "🦸", category: "VOLUNTEER", requirement: { type: "rescues", count: 10 } },
  { id: "fifty_rescues", name: "Legendary Rescuer", description: "Completed 50 rescues", icon: "👑", category: "VOLUNTEER", requirement: { type: "rescues", count: 50 } },
  
  // Reporter Badges
  { id: "first_report", name: "Eyes on Ground", description: "Filed your first report", icon: "👁️", category: "REPORTER", requirement: { type: "reports", count: 1 } },
  { id: "five_reports", name: "Vigilant Guardian", description: "Filed 5 reports", icon: "🛡️", category: "REPORTER", requirement: { type: "reports", count: 5 } },
  { id: "twenty_reports", name: "Community Watch", description: "Filed 20 reports", icon: "🔭", category: "REPORTER", requirement: { type: "reports", count: 20 } },
  
  // Donor Badges
  { id: "first_donation", name: "First Contribution", description: "Made your first donation", icon: "💝", category: "DONOR", requirement: { type: "donations", count: 1 } },
  { id: "thousand_donated", name: "Generous Heart", description: "Donated ₹1,000 total", icon: "💎", category: "DONOR", requirement: { type: "donation_amount", count: 1000 } },
  { id: "ten_thousand_donated", name: "Philanthropist", description: "Donated ₹10,000 total", icon: "🌟", category: "DONOR", requirement: { type: "donation_amount", count: 10000 } },
  
  // Adopter Badges
  { id: "first_adoption", name: "Forever Home", description: "Adopted your first animal", icon: "🏠", category: "ADOPTER", requirement: { type: "adoptions", count: 1 } },
  { id: "three_adoptions", name: "Animal Lover", description: "Adopted 3 animals", icon: "❤️", category: "ADOPTER", requirement: { type: "adoptions", count: 3 } },
  
  // Universal Badges
  { id: "community_hero", name: "Community Hero", description: "Performed 50+ actions", icon: "🌈", category: "ALL", requirement: { type: "total_actions", count: 50 } },
  { id: "early_adopter", name: "Early Adopter", description: "Joined in the first month", icon: "🚀", category: "ALL", requirement: { type: "join_date", count: 30 } }
];

// ✅ GET all badges for current user
gamificationApp.get("/my-badges", verifyToken(), async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const db = mongoose.connection.db;
    
    // Get user data
    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Calculate stats
    const stats = await calculateUserStats(userId, user.role);
    
    // Check which badges are earned
    const earnedBadges = [];
    const lockedBadges = [];
    
    BADGE_DEFINITIONS.forEach(badge => {
      if (badge.category !== "ALL" && badge.category !== user.role) {
        return; // Skip badges for other roles
      }
      
      const earned = checkBadgeRequirement(badge.requirement, stats);
      if (earned) {
        earnedBadges.push(badge);
      } else {
        lockedBadges.push({
          ...badge,
          progress: calculateProgress(badge.requirement, stats)
        });
      }
    });
    
    // Calculate level
    const level = Math.floor(earnedBadges.length / 3) + 1;
    const points = earnedBadges.length * 100;
    
    res.status(200).json({
      message: "Badges fetched",
      payload: {
        earned: earnedBadges,
        locked: lockedBadges,
        stats,
        level,
        points,
        totalBadges: earnedBadges.length + lockedBadges.length
      }
    });
  } catch (err) { next(err); }
});

// ✅ GET all available badges
gamificationApp.get("/all-badges", async (req, res, next) => {
  try {
    res.status(200).json({
      message: "All badges fetched",
      payload: BADGE_DEFINITIONS
    });
  } catch (err) { next(err); }
});

// ✅ GET leaderboard
gamificationApp.get("/leaderboard", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const users = await db.collection("users").find({}).toArray();
    
    const leaderboard = await Promise.all(users.map(async (user) => {
      const stats = await calculateUserStats(user._id, user.role);
      let badgeCount = 0;
      
      BADGE_DEFINITIONS.forEach(badge => {
        if (badge.category !== "ALL" && badge.category !== user.role) return;
        if (checkBadgeRequirement(badge.requirement, stats)) badgeCount++;
      });
      
      return {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        badges: badgeCount,
        points: badgeCount * 100,
        level: Math.floor(badgeCount / 3) + 1,
        profileImageUrl: user.profileImageUrl
      };
    }));
    
    // Sort by points descending
    leaderboard.sort((a, b) => b.points - a.points);
    
    res.status(200).json({
      message: "Leaderboard fetched",
      payload: leaderboard.slice(0, 20) // Top 20
    });
  } catch (err) { next(err); }
});

// Helper functions
async function calculateUserStats(userId, role) {
  const db = mongoose.connection.db;
  const uid = userId.toString();
  
  // Reports count
  const reports = await db.collection("animals").countDocuments({ reportedBy: userId });
  
  // Rescues count (as volunteer)
  const rescues = await db.collection("animals").countDocuments({ 
    assignedVolunteer: userId,
    status: { $in: ["Rescued", "Adoption Pending", "Adopted"] }
  });
  
  // Donations
  const animals = await db.collection("animals").find({ "donations.donor": userId }).toArray();
  let totalDonated = 0;
  let donationCount = 0;
  animals.forEach(a => {
    (a.donations || []).forEach(d => {
      if (d.donor.toString() === uid) {
        totalDonated += Number(d.amount) || 0;
        donationCount++;
      }
    });
  });
  
  // Adoptions
  const adoptions = await db.collection("animals").countDocuments({ 
    "adoption.adopter": userId,
    status: "Adopted"
  });
  
  // Total actions
  const totalActions = reports + rescues + donationCount + adoptions;
  
  // User join date
  const user = await db.collection("users").findOne({ _id: userId });
  const daysSinceJoin = user?.createdAt 
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  return { reports, rescues, totalDonated, donationCount, adoptions, totalActions, daysSinceJoin };
}

function checkBadgeRequirement(requirement, stats) {
  switch (requirement.type) {
    case "rescues": return stats.rescues >= requirement.count;
    case "reports": return stats.reports >= requirement.count;
    case "donations": return stats.donationCount >= requirement.count;
    case "donation_amount": return stats.totalDonated >= requirement.count;
    case "adoptions": return stats.adoptions >= requirement.count;
    case "total_actions": return stats.totalActions >= requirement.count;
    case "join_date": return stats.daysSinceJoin >= requirement.count;
    default: return false;
  }
}

function calculateProgress(requirement, stats) {
  let current = 0;
  switch (requirement.type) {
    case "rescues": current = stats.rescues; break;
    case "reports": current = stats.reports; break;
    case "donations": current = stats.donationCount; break;
    case "donation_amount": current = stats.totalDonated; break;
    case "adoptions": current = stats.adoptions; break;
    case "total_actions": current = stats.totalActions; break;
    case "join_date": current = stats.daysSinceJoin; break;
  }
  return Math.min(100, Math.round((current / requirement.count) * 100));
}