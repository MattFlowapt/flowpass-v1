const fs = require("fs");
const path = require("path");
const { generatePass } = require("./pass-generator");
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase clients
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// In-memory storage
let passes = {
  1234567890: {
    authToken: "SECRET123",
    data: {
      points: 0,
      tier: "Bronze",
      member: "000123456",
    },
    lastUpdated: Date.now(),
  },
};
let lastUpdateTag = Date.now();

// Persistence helpers
function saveData() {
  try {
    if (!fs.existsSync(path.join(__dirname, "data"))) {
      fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
    }
    fs.writeFileSync(
      path.join(__dirname, "data/passes.json"),
      JSON.stringify(passes, null, 2)
    );
    console.log("Pass data saved to disk");
  } catch (err) {
    console.error("Error saving pass data:", err);
  }
}

function loadData() {
  try {
    if (fs.existsSync(path.join(__dirname, "data/passes.json"))) {
      passes = JSON.parse(
        fs.readFileSync(path.join(__dirname, "data/passes.json"), "utf8")
      );
    }
    console.log("Pass data loaded from disk");
  } catch (err) {
    console.error("Error loading pass data:", err);
  }
}

// Function to upload pass to Supabase storage (BULK/LEGACY STORAGE)
async function uploadPassToSupabase(serial, passBuffer) {
  try {
    const fileName = `${serial}.pkpass`;
    
    console.log(`📦 Uploading ${fileName} to individual-passes (bulk storage)...`);
    
    const { data, error } = await supabaseAdmin.storage
      .from('individual-passes')
      .upload(fileName, passBuffer, {
        contentType: 'application/vnd.apple.pkpass',
        upsert: true
      });
    
    if (error) {
      console.error('❌ Individual-passes upload error:', error);
      throw error;
    }
    
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('individual-passes')
      .getPublicUrl(fileName);
    
    console.log(`✅ Pass ${serial} uploaded to individual-passes: ${publicUrl}`);
    return publicUrl;
    
  } catch (error) {
    console.error(`❌ Failed to upload pass ${serial} to individual-passes:`, error);
    throw error;
  }
}

// Helper function to regenerate a pass file after changes
async function updatePassFile(serial) {
  const pass = passes[serial];
  if (!pass) {
    console.error(`Cannot update pass file: Pass ${serial} not found`);
    return false;
  }

  try {
    console.log(`🔄 Regenerating pass ${serial}...`);
    
    // Generate pass (now returns buffer and upload path)
    const result = await generatePass(
      serial,
      pass.data.points,
      pass.data.tier,
      pass.data.member,
      path.join(__dirname, "passes/outputs"), // Still need this for temp directory
    );
    
    // Also upload to individual-passes for bulk/legacy storage
    let individualPassesUrl = null;
    try {
      individualPassesUrl = await uploadPassToSupabase(serial, result.buffer);
      console.log(`🎯 Pass ${serial} available in both locations:`);
      console.log(`   📁 Organized: passes-data/${result.uploadPath}`);
      console.log(`   📦 Bulk: individual-passes`);
    } catch (uploadError) {
      console.warn(`⚠️ Failed to upload to individual-passes (organized storage still succeeded): ${uploadError.message}`);
    }

    return individualPassesUrl;
  } catch (err) {
    console.error(`❌ Failed to regenerate pass ${serial}:`, err);
    return false;
  }
}

// Function to update pass in Supabase database
async function updatePassInSupabase(serial) {
  try {
    if (!passes[serial]) return;
    
    const { error } = await supabase
      .from('passes')
      .upsert({
        serial_number: serial,
        pass_type_identifier: 'pass.com.flowapt.loyalty',
        auth_token: passes[serial].authToken,
        last_updated_tag: passes[serial].lastUpdated.toString(),
        payload: passes[serial].data,
        organization_id: process.env.SUPABASE_ORGANIZATION_ID || '73b7012f-a86d-4188-ad4d-b81c84961c48',
        updated_at: new Date().toISOString()
      }, { onConflict: 'serial_number' });
    
    if (error) throw error;
    console.log(`Supabase database updated for pass ${serial}`);
  } catch (err) {
    console.error(`Supabase database update failed for ${serial}:`, err);
  }
}

// Create a new pass
async function createPass(serialNumber, points, tier, memberNumber, authToken) {
  if (!serialNumber || !authToken) {
    throw new Error("Serial number and auth token are required");
  }

  console.log(`Creating new pass with serial ${serialNumber}`);

  // Check if pass already exists
  if (passes[serialNumber]) {
    throw new Error("Pass with this serial number already exists");
  }

  // Create pass data
  passes[serialNumber] = {
    authToken,
    data: {
      points: points || 0,
      tier: tier || "Bronze",
      member: memberNumber || serialNumber,
    },
    lastUpdated: Date.now(),
  };

  // Save the data
  saveData();

  // Generate the pass file
  try {
    console.log(`🏗️ Generating new pass ${serialNumber}...`);
    
    // Generate pass (now returns buffer and upload path)
    const result = await generatePass(
      serialNumber,
      passes[serialNumber].data.points,
      passes[serialNumber].data.tier,
      passes[serialNumber].data.member,
      path.join(__dirname, "passes/outputs") // Still need this for temp directory
    );

    // Also upload to individual-passes for bulk/legacy storage
    let individualPassesUrl = null;
    try {
      individualPassesUrl = await uploadPassToSupabase(serialNumber, result.buffer);
      console.log(`🎯 New pass ${serialNumber} available in both locations:`);
      console.log(`   📁 Organized: passes-data/${result.uploadPath}`);
      console.log(`   📦 Bulk: individual-passes`);
    } catch (uploadError) {
      console.warn(`⚠️ Failed to upload to individual-passes (organized storage still succeeded): ${uploadError.message}`);
    }

    // Update Supabase database
    updatePassInSupabase(serialNumber).catch(err => console.error("Supabase update error:", err));

    return {
      success: true,
      message: "Pass created successfully",
      passData: passes[serialNumber],
      downloadUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serialNumber}`,
      landingPageUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serialNumber}`,
      supabaseUrl: individualPassesUrl, // Legacy individual-passes URL for backward compatibility
      localUrl: `/download/${serialNumber}.pkpass`
    };
  } catch (err) {
    console.error(`❌ Error generating new pass ${serialNumber}:`, err);
    delete passes[serialNumber];
    saveData();
    throw err;
  }
}

// Add points to a pass
async function addPoints(serial, pointsToAdd, customAlert) {
  if (!serial || !pointsToAdd) {
    throw new Error("Serial and pointsToAdd are required");
  }

  console.log(`Updating pass ${serial} with ${pointsToAdd} points`);

  if (!passes[serial]) {
    throw new Error("Pass not found");
  }

  // Update points and lastUpdated
  passes[serial].data.points += parseInt(pointsToAdd);
  passes[serial].lastUpdated = Date.now() * 1000;
  lastUpdateTag = Date.now() * 1000;

  console.log(`Pass ${serial} updated to ${passes[serial].data.points} points`);

  // Save the updated pass data
  saveData();

  // Regenerate the pass file
  const passUpdated = await updatePassFile(serial);
  if (!passUpdated) {
    throw new Error("Failed to update pass file");
  }

  // Update Supabase database
  updatePassInSupabase(serial).catch(err => console.error("Supabase update error:", err));

  return {
    success: true,
    message: "Points updated and pass file regenerated",
    newPoints: passes[serial].data.points,
    downloadUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serial}`,
    landingPageUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serial}`,
    supabaseUrl: typeof passUpdated === 'string' ? passUpdated : null,
    localUrl: `/download/${serial}.pkpass`,
    serial: serial
  };
}

// Update tier of a pass
async function updateTier(serial, tier) {
  if (!serial || !tier) {
    throw new Error("Serial and tier are required");
  }

  console.log(`Updating pass ${serial} tier to ${tier}`);

  if (!passes[serial]) {
    throw new Error("Pass not found");
  }

  // Update tier and lastUpdated
  passes[serial].data.tier = tier;
  passes[serial].lastUpdated = Date.now() * 1000;
  lastUpdateTag = Date.now() * 1000;

  // Save the updated pass data
  saveData();

  // Regenerate the pass file
  const passUpdated = await updatePassFile(serial);
  if (!passUpdated) {
    throw new Error("Failed to update pass file");
  }

  // Update Supabase database
  updatePassInSupabase(serial).catch(err => console.error("Supabase update error:", err));

  return {
    success: true,
    message: "Tier updated and pass file regenerated",
    newTier: tier,
    downloadUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serial}`,
    landingPageUrl: `https://sponge-internal-lately.ngrok-free.app/pass-download/${serial}`,
    supabaseUrl: typeof passUpdated === 'string' ? passUpdated : null,
    localUrl: `/download/${serial}.pkpass`,
    serial: serial
  };
}

module.exports = {
  get passes() { return passes; },
  get lastUpdateTag() { return lastUpdateTag; },
  saveData,
  loadData,
  createPass,
  addPoints,
  updateTier,
  updatePassFile,
  updatePassInSupabase
}; 