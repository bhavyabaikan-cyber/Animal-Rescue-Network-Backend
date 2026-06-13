import mongoose from "mongoose";

export async function createNotification({ userId, type, title, message, link }) {
  try {
    const notifications = mongoose.connection.db.collection("notifications");
    
    const notification = {
      userId: new mongoose.Types.ObjectId(userId),
      type: type || "general",
      title: title || "Notification",
      message: message || "",
      link: link || null,
      read: false,
      createdAt: new Date()
    };
    
    await notifications.insertOne(notification);
    
    console.log(`✅ [NOTIFICATION] Created for user ${userId}: ${title}`);
    return notification;
  } catch (err) {
    console.error("❌ [NOTIFICATION] Failed to create:", err.message);
    return null;
  }
}