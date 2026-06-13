import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const storyApp = exp.Router();

const getAnimals = () => mongoose.connection.db.collection("animals");
const getUsers = () => mongoose.connection.db.collection("users");

// ✅ GET all success stories (adopted animals)
storyApp.get("/", async (req, res, next) => {
  try {
    const adoptedAnimals = await getAnimals()
      .find({ status: "Adopted" })
      .sort({ "adoption.adoptionDate": -1 })
      .toArray();

    // Enrich with adopter info
    const users = await getUsers().find({}).toArray();
    const userMap = {};
    users.forEach(u => userMap[u._id.toString()] = { firstName: u.firstName, lastName: u.lastName });

    const stories = adoptedAnimals.map(a => ({
      _id: a._id,
      name: a.name,
      species: a.species,
      breed: a.breed,
      imageUrl: a.imageUrl,
      handoffImageUrl: a.adoption?.handoffImageUrl,
      description: a.description,
      story: a.adoption?.story || `After being rescued, ${a.name || "this little one"} found a loving forever home.`,
      adopterName: a.adoption?.adopter ? (userMap[a.adoption.adopter.toString()]?.firstName + " " + userMap[a.adoption.adopter.toString()]?.lastName) || "A loving family" : "A loving family",
      adoptionDate: a.adoption?.adoptionDate,
      location: a.location?.address,
      totalDonations: a.totalPledged || 0,
      donorCount: a.donations?.length || 0
    }));

    res.status(200).json({ message: "Stories fetched", payload: stories });
  } catch (err) { next(err); }
});

// ✅ GET impact statistics
storyApp.get("/stats", async (req, res, next) => {
  try {
    const totalAnimals = await getAnimals().countDocuments();
    const adopted = await getAnimals().countDocuments({ status: "Adopted" });
    const rescued = await getAnimals().countDocuments({ status: { $in: ["Rescued", "Adoption Pending", "Adopted"] } });
    const totalUsers = await getUsers().countDocuments();
    const totalVolunteers = await getUsers().countDocuments({ role: "VOLUNTEER" });

    // Total donations
    const donationPipeline = [
      { $unwind: "$donations" },
      { $group: { _id: null, total: { $sum: "$donations.amount" }, count: { $sum: 1 } } }
    ];
    const donationResult = await getAnimals().aggregate(donationPipeline).toArray();
    const totalDonations = donationResult[0]?.total || 0;
    const totalDonors = donationResult[0]?.count || 0;

    res.status(200).json({
      message: "Impact stats fetched",
      payload: {
        totalAnimals,
        adopted,
        rescued,
        totalUsers,
        totalVolunteers,
        totalDonations,
        totalDonors,
        adoptionRate: totalAnimals > 0 ? Math.round((adopted / totalAnimals) * 100) : 0
      }
    });
  } catch (err) { next(err); }
});

// ✅ POST add a testimonial/story to an adopted animal
storyApp.post("/:animalId/testimonial", verifyToken(), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const { story } = req.body;
    
    if (!story || story.trim().length < 10) {
      return res.status(400).json({ message: "Story must be at least 10 characters" });
    }

    const result = await getAnimals().updateOne(
      { _id: new mongoose.Types.ObjectId(animalId), status: "Adopted" },
      { $set: { "adoption.story": story.trim() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Adopted animal not found" });
    }

    res.status(200).json({ message: "Testimonial added successfully! 🎉" });
  } catch (err) { next(err); }
});