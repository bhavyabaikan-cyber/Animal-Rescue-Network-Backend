import exp from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middlewares/verifyToken.js";

export const notificationApp = exp.Router();

const getNotifications = () => mongoose.connection.db.collection("notifications");

// Helper function to create a notification
export async function createNotification({ userId, type, title, message, link }) {
  try {
    const notification = {
      userId: new mongoose.Types.ObjectId(userId),
      type,
      title,
      message,
      link: link || null,
      read: false,
      createdAt: new Date()
    };
    await getNotifications().insertOne(notification);
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

// ✅ GET all notifications for logged-in user
notificationApp.get("/", verifyToken(), async (req, res, next) => {
  try {
    const notifications = await getNotifications()
      .find({ userId: new mongoose.Types.ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.status(200).json({ message: "Notifications fetched", payload: notifications });
  } catch (err) { next(err); }
});

// ✅ GET unread count
notificationApp.get("/unread-count", verifyToken(), async (req, res, next) => {
  try {
    const count = await getNotifications().countDocuments({ 
      userId: new mongoose.Types.ObjectId(req.user.id), 
      read: false 
    });
    res.status(200).json({ message: "Unread count fetched", payload: { count } });
  } catch (err) { next(err); }
});

// ✅ PUT mark single notification as read
notificationApp.put("/:id/read", verifyToken(), async (req, res, next) => {
  try {
    const { id } = req.params;
    await getNotifications().updateOne(
      { _id: new mongoose.Types.ObjectId(id), userId: new mongoose.Types.ObjectId(req.user.id) },
      { $set: { read: true } }
    );
    res.status(200).json({ message: "Notification marked as read" });
  } catch (err) { next(err); }
});

// ✅ PUT mark all notifications as read
notificationApp.put("/read-all", verifyToken(), async (req, res, next) => {
  try {
    await getNotifications().updateMany(
      { userId: new mongoose.Types.ObjectId(req.user.id), read: false },
      { $set: { read: true } }
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (err) { next(err); }
});

// ✅ DELETE single notification
notificationApp.delete("/:id", verifyToken(), async (req, res, next) => {
  try {
    const { id } = req.params;
    await getNotifications().deleteOne({ 
      _id: new mongoose.Types.ObjectId(id), 
      userId: new mongoose.Types.ObjectId(req.user.id) 
    });
    res.status(200).json({ message: "Notification deleted" });
  } catch (err) { next(err); }
});

// ✅ DELETE all notifications
notificationApp.delete("/", verifyToken(), async (req, res, next) => {
  try {
    await getNotifications().deleteMany({ userId: new mongoose.Types.ObjectId(req.user.id) });
    res.status(200).json({ message: "All notifications deleted" });
  } catch (err) { next(err); }
});

// ✅ GET unread count
notificationApp.get("/unread-count", verifyToken(), async (req, res, next) => {
  try {
    const count = await getNotifications().countDocuments({ 
      userId: new mongoose.Types.ObjectId(req.user.id), 
      read: false 
    });
    res.status(200).json({ message: "Unread count fetched", payload: { count } });
  } catch (err) { 
    console.error("Unread count error:", err);
    next(err); 
  }
});

// ✅ GET all notifications (with limit)
notificationApp.get("/", verifyToken(), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const notifications = await getNotifications()
      .find({ userId: new mongoose.Types.ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    
    res.status(200).json({ message: "Notifications fetched", payload: notifications });
  } catch (err) { next(err); }
});