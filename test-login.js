import axios from "axios";

async function testServer() {
  console.log("\n========================================");
  console.log("🔍 SERVER HEALTH CHECK");
  console.log("========================================\n");

  try {
    console.log("1. Testing if server is reachable...");
    const response = await axios.get("http://localhost:12000/common-api/animals", {
      timeout: 5000
    });
    
    console.log("✅ Server is responding!");
    console.log("Status:", response.status);
    console.log("Data:", response.data);
    
  } catch (err) {
    console.error("❌ Server is NOT responding!");
    console.error("Error:", err.message);
    
    if (err.code === "ECONNREFUSED") {
      console.error("\n💡 The backend is not running!");
      console.error("   Start it with: npx nodemon server.js");
    } else if (err.code === "ETIMEDOUT") {
      console.error("\n💡 Server is taking too long to respond!");
    } else {
      console.error("\n💡 Check if the backend is running and on port 12000");
    }
  }
  
  console.log("\n========================================\n");
}

testServer();