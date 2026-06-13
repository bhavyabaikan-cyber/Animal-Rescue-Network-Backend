import exp from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import { commonApp } from "./APIs/CommonAPI.js";
import { volunteerApp } from "./APIs/VolunteerAPI.js";
import { donorApp } from "./APIs/DonorAPI.js";
import { adopterApp } from "./APIs/AdopterAPI.js";
import { userApp } from "./APIs/UserAPI.js";
import { reporterApp } from "./APIs/ReporterAPI.js";
import { notificationApp } from "./APIs/NotificationAPI.js";
import { messageApp } from "./APIs/MessageAPI.js";
import { commentApp } from "./APIs/CommentAPI.js";
import { adminApp } from "./APIs/AdminAPI.js";
import { storyApp } from "./APIs/StoryAPI.js";
import { analyticsApp } from "./APIs/AnalyticsAPI.js";

dotenv.config();
const app = exp();

// Force redeploy - CORS fix for Vercel frontend
// ✅ Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Allow all origins
    return callback(null, true);
  },
  credentials: false, // Set to false since we're using JWT tokens
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(exp.json({ limit: "10mb" }));
app.use(exp.urlencoded({ extended: true }));

// ✅ Serve uploaded files statically
app.use("/uploads", exp.static("uploads"));
app.use("/uploads/profiles", exp.static("uploads/profiles"));
app.use("/uploads/messages", exp.static("uploads/messages"));
app.use("/uploads/comments", exp.static("uploads/comments"));
app.use("/reporter-api", reporterApp);
// ✅ API Routes
app.use("/common-api", commonApp);
app.use("/volunteer-api", volunteerApp);
app.use("/donor-api", donorApp);
app.use("/adopter-api", adopterApp);
app.use("/user-api", userApp);
app.use("/notification-api", notificationApp);
app.use("/message-api", messageApp);
app.use("/comment-api", commentApp);
app.use("/admin-api", adminApp);
app.use("/story-api", storyApp);
app.use("/analytics-api", analyticsApp);

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error("💥 Server Error:", err.message);
  res.status(500).json({ message: "error occurred", error: err.message });
});

// ✅ Database Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/animal-rescue-db";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ==========================================
// ⚡ REAL-TIME SOCKET.IO ENGINE (Fixed Online Status)
// ==========================================
const PORT = process.env.PORT || 12000;
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", credentials: true }
});

// ✅ Track connected users: Map<userId, socketId>
const onlineUsers = new Map();

io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) return next(new Error("Authentication error"));
  socket.userId = userId;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  
  // Add user to online list
  onlineUsers.set(userId, socket.id);
  console.log(`✅ User ${userId} connected. Total online: ${onlineUsers.size}`);
  
  // Broadcast the updated list of online user IDs to everyone
  io.emit("getOnlineUsers", Array.from(onlineUsers.keys()));

  socket.on("joinRoom", (roomId) => { 
    socket.join(roomId); 
  });
  
  socket.on("sendMessage", (data) => { 
    socket.to(data.roomId).emit("receiveMessage", data); 
  });
  
  socket.on("typing", (data) => { 
    socket.to(data.roomId).emit("userTyping", { userId: socket.userId }); 
  });
  
  socket.on("stopTyping", (data) => { 
    socket.to(data.roomId).emit("userStoppedTyping", { userId: socket.userId }); 
  });
  
  socket.on("disconnect", () => { 
    // Remove user from online list when they disconnect
    onlineUsers.delete(userId);
    console.log(`❌ User ${userId} disconnected. Total online: ${onlineUsers.size}`);
    
    // Broadcast the updated list
    io.emit("getOnlineUsers", Array.from(onlineUsers.keys()));
  });
});

// ✅ Start Server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});