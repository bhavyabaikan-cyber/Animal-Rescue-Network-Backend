import exp from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middlewares/verifyToken.js";

export const messageApp = exp.Router();

// Multer setup for message images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/messages/"),
  filename: (req, file, cb) => cb(null, `msg-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const getConversations = () => mongoose.connection.db.collection("conversations");
const getUsers = () => mongoose.connection.db.collection("users");

// ✅ GET all conversations for the logged-in user
messageApp.get("/conversations", verifyToken(), async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    const conversations = await getConversations()
      .find({ participants: userId })
      .sort({ updatedAt: -1 })
      .toArray();

    // Populate participants
    const users = await getUsers().find({}).toArray();
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        profileImageUrl: u.profileImageUrl
      };
    });

    const enriched = conversations.map(conv => ({
      ...conv,
      participants: conv.participants.map(pId => userMap[pId.toString()] || { _id: pId, firstName: "Unknown" })
    }));

    res.status(200).json({ message: "Conversations fetched", payload: enriched });
  } catch (err) {
    console.error("Get conversations error:", err);
    next(err);
  }
});

// ✅ GET single conversation by ID
messageApp.get("/conversations/:id", verifyToken(), async (req, res, next) => {
  try {
    const convId = req.params.id;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Validate ID format
    if (!convId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const conversation = await getConversations().findOne({ 
      _id: new mongoose.Types.ObjectId(convId) 
    });

    if (!conversation) {
      console.error(`❌ Conversation not found: ${convId}`);
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Populate participants
    const users = await getUsers().find({}).toArray();
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        profileImageUrl: u.profileImageUrl
      };
    });

    const enrichedConv = {
      ...conversation,
      participants: conversation.participants.map(pId => userMap[pId.toString()] || { _id: pId, firstName: "Unknown" })
    };

    // Populate message senders
    if (enrichedConv.messages && enrichedConv.messages.length > 0) {
      enrichedConv.messages = enrichedConv.messages.map(msg => ({
        ...msg,
        sender: userMap[msg.sender.toString()] || { _id: msg.sender, firstName: "Unknown" }
      }));
    }

    res.status(200).json({ message: "Conversation fetched", payload: enrichedConv });
  } catch (err) {
    console.error("Get conversation error:", err);
    next(err);
  }
});

// ✅ POST create or get existing conversation between two users
messageApp.post("/conversations", verifyToken(), async (req, res, next) => {
  try {
    const { otherUserId, animalId } = req.body;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const otherUserObjectId = new mongoose.Types.ObjectId(otherUserId);

    if (!otherUserId) {
      return res.status(400).json({ message: "otherUserId required" });
    }

    // Check if conversation already exists
    let conversation = await getConversations().findOne({
      participants: { $all: [userId, otherUserObjectId] }
    });

    if (conversation) {
      return res.status(200).json({ message: "Conversation exists", payload: conversation });
    }

    // Create new conversation
    const newConv = {
      participants: [userId, otherUserObjectId],
      animalId: animalId ? new mongoose.Types.ObjectId(animalId) : null,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await getConversations().insertOne(newConv);
    newConv._id = result.insertedId;

    res.status(201).json({ message: "Conversation created", payload: newConv });
  } catch (err) {
    console.error("Create conversation error:", err);
    next(err);
  }
});

// ✅ POST send a message in a conversation
messageApp.post("/conversations/:id/messages", verifyToken(), upload.single("image"), async (req, res, next) => {
  try {
    const convId = req.params.id;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { text } = req.body;

    if (!text && !req.file) {
      return res.status(400).json({ message: "Message text or image required" });
    }

    const conversation = await getConversations().findOne({ _id: new mongoose.Types.ObjectId(convId) });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    const message = {
      _id: new mongoose.Types.ObjectId(),
      sender: userId,
      text: text || "",
      imageUrl: req.file ? `http://localhost:12000/uploads/messages/${req.file.filename}` : null,
      createdAt: new Date(),
      readBy: [userId]
    };

    await getConversations().updateOne(
      { _id: new mongoose.Types.ObjectId(convId) },
      { 
        $push: { messages: message },
        $set: { updatedAt: new Date() }
      }
    );

    // Populate sender
    const sender = await getUsers().findOne({ _id: userId });
    message.sender = {
      _id: sender._id,
      firstName: sender.firstName,
      lastName: sender.lastName,
      email: sender.email,
      role: sender.role
    };

    res.status(201).json({ message: "Message sent", payload: message });
  } catch (err) {
    console.error("Send message error:", err);
    next(err);
  }
});

// ✅ PUT mark messages as read
messageApp.put("/conversations/:id/read", verifyToken(), async (req, res, next) => {
  try {
    const convId = req.params.id;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    await getConversations().updateOne(
      { _id: new mongoose.Types.ObjectId(convId) },
      { $addToSet: { "messages.$[].readBy": userId } }
    );

    res.status(200).json({ message: "Messages marked as read" });
  } catch (err) {
    console.error("Mark as read error:", err);
    next(err);
  }
});

// ✅ GET - Unread message count (counts conversations with unread messages)
messageApp.get("/unread-count", verifyToken(), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversations = await getConversations().find({ 
      participants: new mongoose.Types.ObjectId(userId) 
    }).toArray();
    
    let unreadConversations = 0;
    
    for (const conv of conversations) {
      if (conv.messages && conv.messages.length > 0) {
        const lastMsg = conv.messages[conv.messages.length - 1];
        
        // If the last message is NOT from the current user AND they haven't read it
        if (lastMsg.sender.toString() !== userId) {
          const hasRead = lastMsg.readBy && lastMsg.readBy.some(id => id.toString() === userId);
          if (!hasRead) {
            unreadConversations++;
          }
        }
      }
    }
    
    res.status(200).json({ message: "Unread count fetched", payload: { count: unreadConversations } });
  } catch (err) { 
    console.error("Unread count error:", err);
    next(err); 
  }
});

// ✅ GET - Unread message summaries (for the notification bell dropdown)
messageApp.get("/unread-summaries", verifyToken(), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversations = await getConversations().find({ 
      participants: new mongoose.Types.ObjectId(userId) 
    }).toArray();
    
    const unreadMessages = [];
    const usersCollection = mongoose.connection.db.collection("users");
    
    for (const conv of conversations) {
      if (conv.messages && conv.messages.length > 0) {
        const lastMsg = conv.messages[conv.messages.length - 1];
        
        // If the last message is NOT from the current user AND they haven't read it
        if (lastMsg.sender.toString() !== userId) {
          const hasRead = lastMsg.readBy && lastMsg.readBy.some(id => id.toString() === userId);
          if (!hasRead) {
            // Fetch sender info
            const sender = await usersCollection.findOne({ _id: lastMsg.sender });
            const senderName = sender ? `${sender.firstName} ${sender.lastName}` : "Someone";
            
            unreadMessages.push({
              _id: `msg_${lastMsg._id}`, // Unique ID for UI
              type: "message",
              title: `New message from ${senderName}`,
              message: lastMsg.text || "📷 Sent a photo",
              link: `/messages/${conv._id}`,
              createdAt: lastMsg.createdAt,
              read: false
            });
          }
        }
      }
    }
    
    res.status(200).json({ message: "Unread summaries fetched", payload: unreadMessages });
  } catch (err) { 
    console.error("Unread summaries error:", err);
    next(err); 
  }
});