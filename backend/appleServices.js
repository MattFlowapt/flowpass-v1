const fs = require("fs");
const path = require("path");
const apn = require("apn");

// Initialize APN Provider using token-based authentication
const apnProvider = new apn.Provider({
  token: {
    key: fs.readFileSync(
      path.join(__dirname, "certificates/AuthKey_7745436CSV.p8")
    ),
    keyId: "7745436CSV",
    teamId: "YWGPCC8YUN",
  },
  production: true, // Always use production APNs environment
});

// In-memory storage for devices and registrations
let devices = {}; // deviceLibraryIdentifier -> { pushToken }
let registrations = {}; // pass serial -> [deviceLibraryIdentifier, ...]

// Persistence helpers for device data
function saveDeviceData() {
  try {
    if (!fs.existsSync(path.join(__dirname, "data"))) {
      fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
    }
    fs.writeFileSync(
      path.join(__dirname, "data/devices.json"),
      JSON.stringify(devices, null, 2)
    );
    fs.writeFileSync(
      path.join(__dirname, "data/registrations.json"),
      JSON.stringify(registrations, null, 2)
    );
    console.log("Device data saved to disk");
  } catch (err) {
    console.error("Error saving device data:", err);
  }
}

function loadDeviceData() {
  try {
    if (fs.existsSync(path.join(__dirname, "data/devices.json"))) {
      devices = JSON.parse(
        fs.readFileSync(path.join(__dirname, "data/devices.json"), "utf8")
      );
    }
    if (fs.existsSync(path.join(__dirname, "data/registrations.json"))) {
      registrations = JSON.parse(
        fs.readFileSync(path.join(__dirname, "data/registrations.json"), "utf8")
      );
    }
    console.log("Device data loaded from disk");
  } catch (err) {
    console.error("Error loading device data:", err);
  }
}

// Register a device for a pass
function registerDevice(deviceID, passTypeID, serial, authHeader, pushToken, passes) {
  console.log(`⭐️ Registration request for device ${deviceID}, pass ${serial}`);
  console.log(`⭐️ Auth header: ${authHeader}`);

  // Validate passTypeID
  if (passTypeID !== "pass.com.flowapt.loyalty") {
    console.log(`Invalid passTypeID: ${passTypeID}`);
    return { status: 401, message: "Invalid pass type ID" };
  }

  // Get the auth token for this pass
  const pass = passes[serial];
  if (!pass) {
    console.log(`Pass ${serial} not found`);
    return { status: 404, message: "Pass not found" };
  }

  const expectedAuth = `ApplePass ${pass.authToken}`;

  // Verify authentication
  if (authHeader !== expectedAuth) {
    console.log("Authentication failed");
    return { status: 401, message: "Invalid authentication token" };
  }

  if (!pushToken) {
    console.log("No push token provided");
    return { status: 400, message: "No push token provided" };
  }

  // Store device and registration info
  devices[deviceID] = { pushToken };

  if (!registrations[serial]) {
    registrations[serial] = [];
  }

  if (!registrations[serial].includes(deviceID)) {
    registrations[serial].push(deviceID);
    console.log(`New device ${deviceID} registered for pass ${serial}`);
    saveDeviceData();
    return { status: 201, message: "Device registered" };
  } else {
    console.log(`Device ${deviceID} already registered for pass ${serial}`);
    return { status: 200, message: "Device already registered" };
  }
}

// Unregister a device from a pass
function unregisterDevice(deviceID, passTypeID, serial, authHeader, passes) {
  console.log(`Unregistration request for device ${deviceID}, pass ${serial}`);

  // Get the auth token for this pass
  const pass = passes[serial];
  if (!pass) {
    console.log(`Pass ${serial} not found`);
    return { status: 404, message: "Pass not found" };
  }

  const expectedAuth = `ApplePass ${pass.authToken}`;

  // Verify authentication
  if (authHeader !== expectedAuth) {
    console.log("Authentication failed");
    return { status: 401, message: "Invalid authentication token" };
  }

  // Remove device from registration
  if (registrations[serial]) {
    const index = registrations[serial].indexOf(deviceID);
    if (index !== -1) {
      registrations[serial].splice(index, 1);
      console.log(`Device ${deviceID} unregistered from pass ${serial}`);
      saveDeviceData();
      return { status: 200, message: "Device unregistered" };
    }
  }

  console.log(`Device ${deviceID} was not registered for pass ${serial}`);
  return { status: 404, message: "Registration not found" };
}

// Get passes that have been updated since a given tag
function getUpdatedPasses(deviceID, passTypeID, sinceTag, passes, lastUpdateTag) {
  console.log(`🔄 Update check request for device ${deviceID}, passType ${passTypeID}, since ${sinceTag}`);

  // Verify device is registered
  if (!devices[deviceID]) {
    console.log(`Device ${deviceID} not found`);
    return { status: 404, message: "Device not found" };
  }

  // Find passes for this device that have been updated since the tag
  const updatedSerials = [];

  // Get all serials for this device
  Object.keys(registrations).forEach((serial) => {
    if (registrations[serial].includes(deviceID)) {
      // If sinceTag is missing or pass was updated after sinceTag
      const pass = passes[serial];
      const deviceTimestamp = parseInt(sinceTag) || 0;
      const passTimestamp = pass.lastUpdated || 0;

      console.log(`Comparing pass ${serial}: passTimestamp=${passTimestamp}, deviceTimestamp=${deviceTimestamp}`);

      // Always add the pass to the updatedSerials array for testing
      updatedSerials.push(serial);
      console.log(`Pass ${serial} will be updated (forced for testing)`);
    }
  });

  console.log(`Found ${updatedSerials.length} updated passes for device ${deviceID}`);

  const response = {
    serialNumbers: updatedSerials,
    lastUpdated: lastUpdateTag.toString(),
  };

  console.log(`📱 Sending update response: ${JSON.stringify(response)}`);
  return { status: 200, data: response };
}

// Serve a pass file to Apple Wallet
function servePass(passTypeID, serial, authHeader, passes, updatePassFile) {
  console.log(`Pass requested: ${passTypeID}/${serial}`);

  // Get the auth token for this pass
  const pass = passes[serial];
  if (!pass) {
    console.log(`Pass ${serial} not found`);
    return { status: 404, message: "Pass not found" };
  }

  const expectedAuth = `ApplePass ${pass.authToken}`;

  // Verify authentication
  if (authHeader !== expectedAuth) {
    console.log("Authentication failed");
    return { status: 401, message: "Invalid authentication token" };
  }

  // Get the pass file
  const passPath = path.join(__dirname, `passes/outputs/${serial}.pkpass`);

  if (!fs.existsSync(passPath)) {
    console.log(`Pass file not found at ${passPath}, trying to generate it...`);
    // Return indication that pass needs to be generated
    return { status: 'generate', passPath, serial };
  } else {
    // Pass file exists, return path to serve it
    console.log(`Serving existing pass ${serial}`);
    return { status: 200, passPath };
  }
}

// Send push notifications for pass updates
async function sendPassUpdateNotification(serial) {
  const deviceIDs = registrations[serial] || [];
  console.log(`Attempting push to ${deviceIDs.length} devices for pass ${serial}`);

  const results = [];

  for (const deviceID of deviceIDs) {
    const token = devices[deviceID]?.pushToken;
    if (token) {
      try {
        // Create the most minimal push notification possible
        let note = new apn.Notification();
        note.topic = "pass.com.flowapt.loyalty";
        note.pushType = "background";
        note.payload = {};

        console.log(`Sending minimal pass update push to token: ${token}`);

        const result = await apnProvider.send(note, token);
        console.log(`Push result for ${deviceID}: ${JSON.stringify(result)}`);
        
        results.push({
          deviceID,
          sent: result.sent.length > 0,
          failed: result.failed.length > 0,
          failure: result.failed[0] || null,
        });

        if (result.failed.length > 0) {
          console.error(`Push failed: ${JSON.stringify(result.failed[0])}`);
        }
      } catch (err) {
        console.error(`Push error: ${err.message}`);
        results.push({
          deviceID,
          error: err.message,
        });
      }
    }
  }

  return results;
}

// Send test push notifications
async function sendTestPushNotification(serial, passes) {
  if (!passes[serial]) {
    return { status: 404, error: "Pass not found" };
  }

  const deviceIDs = registrations[serial] || [];
  if (deviceIDs.length === 0) {
    return { status: 404, error: "No devices registered for this pass" };
  }

  let results = [];

  for (const deviceID of deviceIDs) {
    const token = devices[deviceID]?.pushToken;
    if (!token) continue;

    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.badge = 1;
    note.sound = "default";
    note.alert = "Test notification from loyalty pass";
    note.topic = "pass.com.flowapt.loyalty";
    note.payload = {
      aps: {
        alert: "Simple test notification",
        badge: 1,
      },
    };

    try {
      const result = await apnProvider.send(note, token);
      console.log(`Push test result: ${JSON.stringify(result)}`);
      results.push({
        deviceID,
        sent: result.sent.length > 0,
        failed: result.failed.length > 0,
        failure: result.failed[0] || null,
      });
    } catch (err) {
      console.error("Push test error:", err);
      results.push({
        deviceID,
        error: err.message,
      });
    }
  }

  return {
    status: 200,
    results,
    deviceCount: deviceIDs.length,
  };
}

// Graceful shutdown
function shutdown() {
  console.log("Shutting down Apple services...");
  saveDeviceData();
  apnProvider.shutdown();
}

module.exports = {
  devices,
  registrations,
  loadDeviceData,
  saveDeviceData,
  registerDevice,
  unregisterDevice,
  getUpdatedPasses,
  servePass,
  sendPassUpdateNotification,
  sendTestPushNotification,
  shutdown
}; 