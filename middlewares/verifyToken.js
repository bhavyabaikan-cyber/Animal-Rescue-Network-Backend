import jwt from "jsonwebtoken";

export const verifyToken = (requiredRole = null) => {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
      }
      
      const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
      
      if (!token) {
        return res.status(401).json({ message: "Token is empty" });
      }
      
      // ✅ Use the SAME secret as login
      const secret = process.env.JWT_SECRET || "super_secret_fallback_key";
      const decoded = jwt.verify(token, secret);
      
      req.user = decoded;
      
      // Check role if required
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ message: `Access denied - requires ${requiredRole} role` });
      }
      
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
};