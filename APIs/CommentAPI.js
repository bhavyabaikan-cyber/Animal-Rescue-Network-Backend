import exp from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { verifyToken } from "../middlewares/verifyToken.js";

export const commentApp = exp.Router();

// ✅ Ensure uploads/comments directory exists
const uploadDir = "uploads/comments";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Multer setup for comment images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `comment-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

const getComments = () => mongoose.connection.db.collection("comments");
const getUsers = () => mongoose.connection.db.collection("users");

// ✅ POST - Add comment with optional image
commentApp.post("/animal/:animalId", verifyToken(), upload.single("image"), async (req, res, next) => {
  try {
    const { animalId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Comment text is required" });
    }
    
    if (!animalId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid animal ID format" });
    }
    
    const newComment = {
      animalId: new mongoose.Types.ObjectId(animalId),
      userId: new mongoose.Types.ObjectId(req.user.id),
      text: text.trim(),
      imageUrl: req.file ? `http://localhost:12000/uploads/comments/${req.file.filename}` : null,
      likedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await getComments().insertOne(newComment);
    newComment._id = result.insertedId;
    
    // Populate user info
    const user = await getUsers().findOne({ _id: new mongoose.Types.ObjectId(req.user.id) });
    const populatedComment = {
      ...newComment,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profileImageUrl: user.profileImageUrl
      },
      likeCount: 0,
      isLikedByMe: false
    };
    
    res.status(201).json({ 
      message: "Comment added successfully", 
      payload: populatedComment 
    });
  } catch (err) {
    console.error("💥 [COMMENT] Error:", err);
    next(err);
  }
});

// ✅ GET - All comments for an animal
commentApp.get("/animal/:animalId", async (req, res, next) => {
  try {
    const { animalId } = req.params;
    
    if (!animalId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid animal ID format" });
    }
    
    const comments = await getComments()
      .find({ animalId: new mongoose.Types.ObjectId(animalId) })
      .sort({ createdAt: -1 })
      .toArray();
    
    // Populate user info
    const users = await getUsers().find({}).toArray();
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        profileImageUrl: u.profileImageUrl
      };
    });
    
    // Get current user ID if logged in
    const currentUserId = req.user?.id;
    
    const populatedComments = comments.map(c => ({
      ...c,
      user: userMap[c.userId.toString()] || { _id: c.userId, firstName: "Unknown" },
      likeCount: c.likedBy?.length || 0,
      isLikedByMe: currentUserId ? c.likedBy?.some(id => id.toString() === currentUserId) : false
    }));
    
    res.status(200).json({ message: "Comments fetched", payload: populatedComments });
  } catch (err) {
    console.error("Get comments error:", err);
    next(err);
  }
});

// ✅ POST - Like/Unlike a comment (toggle)
commentApp.post("/:commentId/like", verifyToken(), async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    if (!commentId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid comment ID format" });
    }
    
    const comment = await getComments().findOne({ _id: new mongoose.Types.ObjectId(commentId) });
    
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    
    // Check if user already liked
    const likedBy = comment.likedBy || [];
    const alreadyLiked = likedBy.some(id => id.toString() === req.user.id);
    
    let updateOperation;
    let isLiked;
    
    if (alreadyLiked) {
      // Remove like
      updateOperation = { $pull: { likedBy: userId } };
      isLiked = false;
    } else {
      // Add like
      updateOperation = { $addToSet: { likedBy: userId } };
      isLiked = true;
    }
    
    await getComments().updateOne(
      { _id: new mongoose.Types.ObjectId(commentId) },
      updateOperation
    );
    
    // Fetch updated comment
    const updatedComment = await getComments().findOne({ _id: new mongoose.Types.ObjectId(commentId) });
    
    res.status(200).json({ 
      message: isLiked ? "Comment liked" : "Comment unliked",
      payload: {
        commentId: updatedComment._id,
        likeCount: updatedComment.likedBy?.length || 0,
        isLikedByMe: isLiked
      }
    });
  } catch (err) {
    console.error("Like comment error:", err);
    next(err);
  }
});

// ✅ DELETE - Remove a comment
commentApp.delete("/:commentId", verifyToken(), async (req, res, next) => {
  try {
    const { commentId } = req.params;
    
    if (!commentId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid comment ID format" });
    }
    
    const comment = await getComments().findOne({ _id: new mongoose.Types.ObjectId(commentId) });
    
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    
    const isOwner = comment.userId.toString() === req.user.id;
    const isAdmin = req.user.role === "ADMIN";
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to delete this comment" });
    }
    
    await getComments().deleteOne({ _id: new mongoose.Types.ObjectId(commentId) });
    
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (err) {
    console.error("Delete comment error:", err);
    next(err);
  }
});