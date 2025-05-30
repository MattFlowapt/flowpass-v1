// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");

// Import our custom modules
const passManager = require("./passManager");
const appleServices = require("./appleServices");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Load data on startup
passManager.loadData();
appleServices.loadDeviceData();

console.log("FlowPass server initialized with Supabase integration");

// ==================== APPLE WALLET WEBHOOK ENDPOINTS ====================

// Register a device for a pass
app.post(
  "/pass/v1/devices/:deviceID/registrations/:passTypeID/:serial",
  (req, res) => {
    const { deviceID, passTypeID, serial } = req.params;
    const authHeader = req.headers.authorization;
    const pushToken = req.body.pushToken;

    console.log(`⭐️ Request body:`, JSON.stringify(req.body));

    const result = appleServices.registerDevice(
      deviceID, 
      passTypeID, 
      serial, 
      authHeader, 
      pushToken, 
      passManager.passes
    );

    res.status(result.status).send(result.message);
  }
);

// Unregister a device from a pass
app.delete(
  "/pass/v1/devices/:deviceID/registrations/:passTypeID/:serial",
  (req, res) => {
    const { deviceID, passTypeID, serial } = req.params;
    const authHeader = req.headers.authorization;

    const result = appleServices.unregisterDevice(
      deviceID, 
      passTypeID, 
      serial, 
      authHeader, 
      passManager.passes
    );

    res.status(result.status).send(result.message);
  }
);

// Get passes that have been updated since a given tag
app.get("/pass/v1/devices/:deviceID/registrations/:passTypeID", (req, res) => {
  const { deviceID, passTypeID } = req.params;
  const sinceTag = req.query.passesUpdatedSince;

  const result = appleServices.getUpdatedPasses(
    deviceID, 
    passTypeID, 
    sinceTag, 
    passManager.passes, 
    passManager.lastUpdateTag
  );

  if (result.status === 200) {
    res.json(result.data);
  } else {
    res.status(result.status).send(result.message);
  }
});

// Serve a pass
app.get("/pass/v1/passes/:passTypeID/:serial", async (req, res) => {
  const { passTypeID, serial } = req.params;
  const authHeader = req.headers.authorization;

  const result = appleServices.servePass(
    passTypeID, 
    serial, 
    authHeader, 
    passManager.passes, 
    passManager.updatePassFile
  );

  if (result.status === 200) {
    res.set("Content-Type", "application/vnd.apple.pkpass");
    res.sendFile(result.passPath);
  } else if (result.status === 'generate') {
    // Try to generate the pass on the fly
    try {
      const success = await passManager.updatePassFile(serial);
        if (success) {
          res.set("Content-Type", "application/vnd.apple.pkpass");
        res.sendFile(result.passPath);
          console.log(`Generated and served pass ${serial}`);
        } else {
          res.status(500).send("Could not generate pass file");
        }
    } catch (err) {
        console.error(`Error generating pass ${serial}:`, err);
        res.status(500).send("Error generating pass file");
    }
        } else {
    res.status(result.status).send(result.message);
  }
});

// ==================== PASS MANAGEMENT API ENDPOINTS ====================

// Create a new pass
app.post("/api/createPass", async (req, res) => {
  const { serialNumber, points, tier, memberNumber, authToken } = req.body;

  try {
    const result = await passManager.createPass(
      serialNumber,
      points, 
      tier, 
      memberNumber, 
      authToken
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to create pass",
      error: err.message,
    });
  }
});

// Update a pass (add points)
app.post("/api/addPoints", async (req, res) => {
  const { serial, pointsToAdd, customAlert } = req.body;

  try {
    const result = await passManager.addPoints(serial, pointsToAdd, customAlert);
    
    // Send push notification in the background
    appleServices.sendPassUpdateNotification(serial)
      .then(pushResults => {
        console.log(`Push notification results for ${serial}:`, pushResults);
      })
      .catch(err => {
        console.error(`Push notification error for ${serial}:`, err);
      });

    res.json(result);
  } catch (err) {
    res.status(err.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: err.message,
    });
  }
});

// Update tier level
app.post("/api/updateTier", async (req, res) => {
  const { serial, tier } = req.body;

  try {
    const result = await passManager.updateTier(serial, tier);
    
    // Send push notification in the background
    appleServices.sendPassUpdateNotification(serial)
      .then(pushResults => {
        console.log(`Push notification results for ${serial}:`, pushResults);
      })
      .catch(err => {
        console.error(`Push notification error for ${serial}:`, err);
      });

    res.json(result);
  } catch (err) {
    res.status(err.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: err.message,
    });
  }
});

// ==================== DOWNLOAD ENDPOINTS ====================

// Download a pass directly
app.get("/download/:serial.pkpass", async (req, res) => {
  const serial = req.params.serial;
  console.log(`Direct download requested for pass ${serial}`);

  const passPath = path.join(__dirname, `passes/outputs/${serial}.pkpass`);

  if (!fs.existsSync(passPath)) {
    console.log(`Pass file not found at ${passPath}, trying to generate it...`);
    
    if (!passManager.passes[serial]) {
      return res.status(404).send("Pass not found");
    }

    try {
      const success = await passManager.updatePassFile(serial);
      if (success) {
        res.set("Content-Type", "application/vnd.apple.pkpass");
        res.sendFile(passPath);
        console.log(`Generated and served pass ${serial} for direct download`);
      } else {
        res.status(500).send("Could not generate pass file");
      }
    } catch (err) {
      console.error(`Error generating pass ${serial}:`, err);
      res.status(500).send("Error generating pass file");
    }
  } else {
    res.set("Content-Type", "application/vnd.apple.pkpass");
    res.sendFile(passPath);
    console.log(`Served existing pass ${serial} for direct download`);
  }
});

// Pass landing page endpoint - serves a nice UI instead of direct download
app.get("/pass-download/:serial", (req, res) => {
  const serial = req.params.serial;
  
  if (!passManager.passes[serial]) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pass Not Found - Flowapt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; text-align: center; }
          .container { max-width: 400px; margin: 0 auto; padding: 40px 20px; }
          .logo { font-size: 32px; font-weight: bold; margin-bottom: 30px; }
          .error { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 16px; backdrop-filter: blur(10px); }
          h1 { margin: 0 0 20px 0; font-size: 24px; }
          p { margin: 0; opacity: 0.9; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">⚡️ Flowapt</div>
          <div class="error">
            <h1>Pass Not Found</h1>
            <p>The requested loyalty pass could not be found. Please check your link or contact support.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  const pass = passManager.passes[serial];
  const supabaseUrl = `https://zvhwjpeeapujvuudfdps.supabase.co/storage/v1/object/public/individual-passes/${serial}.pkpass`;
  const localUrl = `https://sponge-internal-lately.ngrok-free.app/download/${serial}.pkpass`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Download Your Loyalty Pass - Flowapt</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
          margin: 0; 
          padding: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh; 
          color: white; 
          text-align: center; 
        }
        .container { 
          max-width: 400px; 
          margin: 0 auto; 
          padding: 40px 20px; 
        }
        .logo { 
          font-size: 32px; 
          font-weight: bold; 
          margin-bottom: 30px; 
        }
        .card { 
          background: rgba(255,255,255,0.1); 
          padding: 30px; 
          border-radius: 16px; 
          backdrop-filter: blur(10px); 
          margin-bottom: 20px; 
        }
        .pass-info { 
          margin-bottom: 30px; 
        }
        .tier { 
          font-size: 24px; 
          font-weight: bold; 
          margin-bottom: 10px; 
          color: #FFD700; 
        }
        .points { 
          font-size: 18px; 
          margin-bottom: 5px; 
        }
        .member { 
          opacity: 0.8; 
          font-size: 14px; 
        }
        .download-btn { 
          background: linear-gradient(45deg, #FF6B6B, #FFE66D); 
          color: #333; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 12px; 
          font-size: 16px; 
          font-weight: bold; 
          cursor: pointer; 
          text-decoration: none; 
          display: inline-block; 
          transition: transform 0.2s; 
          width: 100%; 
          box-sizing: border-box; 
        }
        .download-btn:hover { 
          transform: translateY(-2px); 
        }
        .subtitle { 
          margin-top: 15px; 
          font-size: 14px; 
          opacity: 0.8; 
        }
        .backup-link { 
          margin-top: 20px; 
          font-size: 12px; 
          opacity: 0.6; 
        }
        .backup-link a { 
          color: white; 
          text-decoration: underline; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡️ Flowapt Rewards</div>
        
        <div class="card">
          <div class="pass-info">
            <div class="tier">${pass.data.tier} Member</div>
            <div class="points">${pass.data.points} Points</div>
            <div class="member">Member #${pass.data.member}</div>
          </div>
          
          <a href="${supabaseUrl}" class="download-btn">
            📱 Add to Apple Wallet
          </a>
          
          <div class="subtitle">
            Tap to download and add your loyalty pass to Apple Wallet
          </div>
        </div>
        
        <div class="backup-link">
          Having trouble? <a href="${localUrl}">Try backup download</a>
        </div>
      </div>
      
      <script>
        console.log('Pass landing page loaded for serial: ${serial}');
      </script>
    </body>
    </html>
  `);
});

// ==================== UTILITY & TEST ENDPOINTS ====================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Test push notification endpoint
app.get("/test-push/:serial", async (req, res) => {
  const serial = req.params.serial;
  const result = await appleServices.sendTestPushNotification(serial, passManager.passes);
  
  if (result.status === 200) {
    res.json(result);
  } else {
    res.status(result.status).json({ error: result.error });
  }
});

// Simple push notification test
app.get("/simple-push/:serial", async (req, res) => {
  const serial = req.params.serial;
  
  try {
    const results = await appleServices.sendPassUpdateNotification(serial);
  res.json({
      success: true,
      message: "Simple push notification sent",
    results,
      deviceCount: appleServices.registrations[serial]?.length || 0,
      });
    } catch (err) {
    res.status(500).json({
      success: false,
        error: err.message,
      });
    }
});

// ==================== SERVER STARTUP & SHUTDOWN ====================

// Start the server
app.listen(PORT, () => {
  console.log(`FlowPass server running on port ${PORT}`);
  console.log("Modules loaded:");
  console.log("✅ Pass Manager - Pass operations and Supabase storage");
  console.log("✅ Apple Services - Webhooks and push notifications");
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down FlowPass server...");
  passManager.saveData();
  appleServices.shutdown();
  process.exit(0);
});