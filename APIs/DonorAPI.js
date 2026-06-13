import exp from "express";
import Stripe from "stripe";
import { AnimalModel } from "../models/AnimalModel.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import mongoose from "mongoose";
import { createNotification } from "../utils/createNotification.js";
import { sendDonationReceiptEmail } from "../utils/sendEmail.js";
import { UserModel } from "../models/UserModel.js";

export const donorApp = exp.Router();

// ✅ Stripe initialization with validation
const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  console.log("Stripe key check:", key ? `Loaded (${key.substring(0, 15)}...)` : "NOT LOADED");
  
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .env file");
  if (!key.startsWith("sk_")) throw new Error(`Invalid Stripe key format: ${key.substring(0, 10)}...`);
  
  return new Stripe(key);
};

// ✅ CREATE CHECKOUT SESSION
donorApp.post("/create-checkout-session", verifyToken(), async (req, res, next) => {
  try {
    console.log("[DONOR API] Creating checkout session...");
    const { amount, animalId, message } = req.body;
    
    if (!amount || amount < 1) return res.status(400).json({ message: "Valid amount required" });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "inr",
          product_data: { name: "Animal Rescue Donation", description: `Support case ${animalId}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/donate-success?session_id={CHECKOUT_SESSION_ID}&animalId=${animalId}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/case/${animalId}`,
      metadata: { donorId: req.user.id, animalId, message: message || "" }
    });

    console.log("Checkout session created:", session.id);
    res.json({ id: session.id, url: session.url });
  } catch (err) { 
    console.error("[DONOR API] Error:", err.message);
    next(err); 
  }
});

// ✅ VERIFY PAYMENT & RECORD DONATION
donorApp.post("/verify-donation", verifyToken(), async (req, res, next) => {
  try {
    console.log("[DONOR API] Verifying donation...");
    const stripe = getStripe();
    const { sessionId, animalId } = req.body;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log("Payment status:", session.payment_status);

    if (session.payment_status === "paid") {
      const amount = session.amount_total / 100;
      const animal = await AnimalModel.findById(animalId);
      
      if (!animal) return res.status(404).json({ message: "error occurred", error: "Case not found" });

      animal.donations.push({
        donor: req.user.id,
        amount,
        message: session.metadata.message || "General support",
        paymentId: session.payment_intent,
        orderId: session.id
      });
      animal.totalPledged = (animal.totalPledged || 0) + amount;
      await animal.save();

      // ✅ Send Donation Receipt Email
      const donor = await UserModel.findById(req.user.id);
      if (donor) {
        sendDonationReceiptEmail(donor, animal, amount);
      }

      // 🔔 Notify the assigned volunteer about the new donation
      if (animal.assignedVolunteer) {
        await createNotification({
          userId: animal.assignedVolunteer.toString(),
          type: "donation",
          title: "New Donation Received", // ✅ Professional, no emoji
          message: `Someone donated Rs. ${amount} to help ${animal.name || "the animal"} you are rescuing.`,
          link: `/case/${animalId}`
        });
      }

      console.log("Donation recorded successfully");
      res.json({ message: "Donation recorded", payload: animal });
    } else {
      console.log("Payment not completed, status:", session.payment_status);
      res.status(400).json({ message: "Payment not completed" });
    }
  } catch (err) { 
    console.error("[DONOR API] Error verifying donation:", err);
    next(err); 
  }
});

// ✅ GET CASES NEEDING SUPPORT
donorApp.get("/cases", verifyToken("DONOR"), async (req, res, next) => {
  try {
    const cases = await AnimalModel.find({ status: { $ne: "Adopted" } })
      .populate("reportedBy", "firstName lastName email")
      .populate("assignedVolunteer", "firstName lastName")
      .sort({ createdAt: -1 });
    res.status(200).json({ message: "Cases needing support", payload: cases });
  } catch (err) { next(err); }
});

// ✅ GET MY PLEDGES
donorApp.get("/my-pledges", verifyToken("DONOR"), async (req, res, next) => {
  try {
    const pledges = await AnimalModel.find({ "donations.donor": req.user.id })
      .select("name species status location donations totalPledged createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json({ message: "My pledges", payload: pledges });
  } catch (err) { next(err); }
});

// ✅ GET Donor Dashboard Data
donorApp.get("/my-donations", verifyToken("DONOR"), async (req, res, next) => {
  try {
    const collection = mongoose.connection.db.collection("animals");
    const animals = await collection.find({ "donations.donor": new mongoose.Types.ObjectId(req.user.id) }).sort({ createdAt: -1 }).toArray();

    let totalDonated = 0;
    let casesFunded = animals.length;

    const myDonations = animals.map(a => {
      const myDonos = (a.donations || []).filter(d => d.donor.toString() === req.user.id);
      myDonos.forEach(d => { totalDonated += Number(d.amount) || 0; });
      return { ...a, myDonations: myDonos };
    });

    res.status(200).json({
      message: "Donor dashboard data fetched",
      payload: { totalDonated, casesFunded, donations: myDonations }
    });
  } catch (err) { 
    console.error("Donor API Error:", err.message);
    res.status(500).json({ message: "error occurred", error: err.message });
  }
});

// ✅ POST - Donate to a specific case
donorApp.post("/donate/:animalId", verifyToken(), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const { amount, message } = req.body;
    const donorId = req.user.id;
    
    console.log("\n💰 [DONATION] Processing:");
    console.log("  - Animal ID:", animalId);
    console.log("  - Donor ID:", donorId);
    console.log("  - Amount:", amount);
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid donation amount" });
    }
    
    const animals = mongoose.connection.db.collection("animals");
    const animal = await animals.findOne({ _id: new mongoose.Types.ObjectId(animalId) });
    
    if (!animal) {
      return res.status(404).json({ message: "Case not found" });
    }
    
    const donation = {
      donor: new mongoose.Types.ObjectId(donorId),
      amount: parseFloat(amount),
      message: message || "",
      date: new Date()
    };
    
    await animals.updateOne(
      { _id: new mongoose.Types.ObjectId(animalId) },
      {
        $push: { donations: donation },
        $inc: { totalPledged: parseFloat(amount) }
      }
    );
    
    // Notify the reporter and volunteer
    const notifications = mongoose.connection.db.collection("notifications");
    const users = mongoose.connection.db.collection("users");
    const donor = await users.findOne({ _id: new mongoose.Types.ObjectId(donorId) });
    const donorName = donor ? `${donor.firstName} ${donor.lastName}` : "Someone";
    
    // Notify reporter
    if (animal.reportedBy) {
      await notifications.insertOne({
        userId: new mongoose.Types.ObjectId(animal.reportedBy.toString()),
        type: "donation",
        title: "New Donation Received! 💰",
        message: `${donorName} donated ₹${amount} to your reported case: ${animal.name || "the animal"}.`,
        link: `/case/${animalId}`,
        read: false,
        createdAt: new Date()
      });
    }
    
    // Notify volunteer
    if (animal.assignedVolunteer) {
      await notifications.insertOne({
        userId: new mongoose.Types.ObjectId(animal.assignedVolunteer.toString()),
        type: "donation",
        title: "New Donation Received! 💰",
        message: `${donorName} donated ₹${amount} to the case you're handling: ${animal.name || "the animal"}.`,
        link: `/case/${animalId}`,
        read: false,
        createdAt: new Date()
      });
    }
    
    console.log("✅ [DONATION] Successfully processed\n");
    
    res.status(201).json({ 
      message: "Donation successful! Thank you for your generosity! 💚", 
      payload: { animalId, amount, donorId }
    });
  } catch (err) {
    console.error("💥 [DONATION] Error:", err);
    next(err);
  }
});