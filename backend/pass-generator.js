const fs = require("fs");
const path = require("path");
const { PKPass } = require("passkit-generator");
const { createClient } = require('@supabase/supabase-js');
require("dotenv").config();

// Initialize Supabase client for template downloads
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// =================================================================================
// NEW SUPABASE-BASED PASS GENERATOR (MULTI-TENANT)
// =================================================================================

async function generatePass(
  serialNumber,
  points,
  tier,
  memberNumber,
  outputPath = "./passes/outputs",
  organizationId = process.env.SUPABASE_ORGANIZATION_ID
) {
  try {
    console.log(
      `🚀 Generating pass for serial: ${serialNumber}, org: ${organizationId}, with ${points} points, tier: ${tier}`
    );

    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Create temporary directory for downloaded template
    const tempTemplateDir = path.join(outputPath, `temp_${organizationId}_${Date.now()}.pass`);
    if (!fs.existsSync(tempTemplateDir)) {
      fs.mkdirSync(tempTemplateDir, { recursive: true });
    }

    try {
      // Download template files from Supabase storage
      console.log(`📥 Downloading template files for organization ${organizationId}...`);
      
      const templateFiles = [
        'pass.json',
        'icon.png', 
        'logo.png',
        'logo@2x.png',
        'logo@3x.png',
        'strip.png'
      ];

      // Download each template file
      for (const fileName of templateFiles) {
        const filePath = `${organizationId}/templates/loyalty-card/${fileName}`;
        console.log(`  📄 Downloading ${fileName} from ${filePath}...`);
        
        const { data, error } = await supabaseAdmin.storage
          .from('passes-data')
          .download(filePath);

        if (error) {
          console.error(`❌ Failed to download ${fileName}:`, error);
          throw new Error(`Failed to download template file ${fileName}: ${error.message}`);
        }

        // Convert blob to buffer and save to temp directory
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const localFilePath = path.join(tempTemplateDir, fileName);
        fs.writeFileSync(localFilePath, buffer);
        console.log(`  ✅ Downloaded ${fileName} (${buffer.length} bytes)`);
      }

      // Read and update the pass.json
      const passJsonPath = path.join(tempTemplateDir, 'pass.json');
      const passJson = JSON.parse(fs.readFileSync(passJsonPath, 'utf8'));

      // Create updated pass JSON
      const updatedPassJson = JSON.parse(JSON.stringify(passJson));
      updatedPassJson.serialNumber = serialNumber;
      
      // Update headerFields with points instead of primaryFields
      if (updatedPassJson.storeCard.headerFields && updatedPassJson.storeCard.headerFields.length > 0) {
        updatedPassJson.storeCard.headerFields[0].value = points.toString();
      }
      
      // Leave primaryFields empty for the strip to show
      if (updatedPassJson.storeCard.primaryFields && updatedPassJson.storeCard.primaryFields.length > 0) {
        updatedPassJson.storeCard.primaryFields[0].value = "";
      }
      
      if (updatedPassJson.storeCard.secondaryFields) {
        if (updatedPassJson.storeCard.secondaryFields[0]) {
          updatedPassJson.storeCard.secondaryFields[0].value = tier;
        }
        if (updatedPassJson.storeCard.secondaryFields[1]) {
          updatedPassJson.storeCard.secondaryFields[1].value = memberNumber;
        }
      }

      // Always update relevantDate to current time to increase notification priority
      updatedPassJson.relevantDate = new Date().toISOString();

      // Set the current webServiceURL from ngrok
      try {
        const ngrokDataPath = path.join(__dirname, "../ngrok_url.json");
        if (fs.existsSync(ngrokDataPath)) {
          const ngrokData = JSON.parse(fs.readFileSync(ngrokDataPath, "utf8"));
          updatedPassJson.webServiceURL = `${ngrokData.url}/pass`;
          console.log(`🌐 Updated webServiceURL to: ${updatedPassJson.webServiceURL}`);
        }
      } catch (error) {
        console.warn("⚠️ Failed to update webServiceURL:", error.message);
      }

      // Write updated pass.json
      fs.writeFileSync(passJsonPath, JSON.stringify(updatedPassJson, null, 2));

      // Path to certificates (still using local certificates - you keep these)
      const signerCertPath = path.join(__dirname, "certificates/signerCert.pem");
      const signerKeyPath = path.join(__dirname, "certificates/signerKey.pem");
      const wwdrPath = path.join(__dirname, "certificates/wwdr.pem");

      // Verify certificates exist
      if (!fs.existsSync(signerCertPath) || !fs.existsSync(signerKeyPath) || !fs.existsSync(wwdrPath)) {
        throw new Error("Certificate files not found - you'll need to add these for pass signing");
      }

      // Create pass using downloaded template
      console.log("🔏 Creating and signing pass...");
      const pass = await PKPass.from({
        model: tempTemplateDir,
        certificates: {
          wwdr: fs.readFileSync(wwdrPath),
          signerCert: fs.readFileSync(signerCertPath),
          signerKey: fs.readFileSync(signerKeyPath),
          signerKeyPassphrase: process.env.PASS_CERT_PASSPHRASE || "Flowapt123!",
        },
      });

      // Generate the .pkpass file
      const buffer = await pass.getAsBuffer();

      // Upload generated pass to Supabase (in organization's generated folder)
      console.log("☁️ Uploading generated pass to Supabase...");
      const passFileName = `${serialNumber}.pkpass`;
      const passUploadPath = `${organizationId}/generated/${passFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('passes-data')
        .upload(passUploadPath, buffer, {
          contentType: 'application/vnd.apple.pkpass',
          upsert: true
        });

      if (uploadError) {
        console.warn(`⚠️ Failed to upload pass to Supabase: ${uploadError.message}`);
        throw new Error(`Failed to upload pass: ${uploadError.message}`);
      } else {
        console.log(`✅ Pass uploaded to: passes-data/${passUploadPath}`);
      }

      console.log(`🎉 Pass generated successfully (cloud-only): ${passUploadPath}`);
      return { buffer, uploadPath: passUploadPath };

    } finally {
      // Clean up temporary template directory
      if (fs.existsSync(tempTemplateDir)) {
        fs.rmSync(tempTemplateDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up temporary template directory`);
      }
    }

  } catch (error) {
    console.error("❌ Error generating pass:", error);
    throw error;
  }
}

// =================================================================================
// OLD LOCAL FILESYSTEM VERSION (COMMENTED OUT)
// =================================================================================

/*
// Function to generate a .pkpass file (OLD VERSION - USES LOCAL FILESYSTEM)
async function generatePassOLD(
  serialNumber,
  points,
  tier,
  memberNumber,
  outputPath = "./passes/outputs"
) {
  try {
    console.log(
      `Generating pass for serial: ${serialNumber}, with ${points} points, tier: ${tier}`
    );

    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Path to pass template and certificates (using the new PEM format certificates)
    const templatePath = path.join(__dirname, "passes/LoyaltyCard.pass");
    const signerCertPath = path.join(__dirname, "certificates/signerCert.pem");
    const signerKeyPath = path.join(__dirname, "certificates/signerKey.pem");
    const wwdrPath = path.join(__dirname, "certificates/wwdr.pem");

    console.log("Template path:", templatePath, fs.existsSync(templatePath));
    console.log(
      "Signer cert path:",
      signerCertPath,
      fs.existsSync(signerCertPath)
    );
    console.log(
      "Signer key path:",
      signerKeyPath,
      fs.existsSync(signerKeyPath)
    );
    console.log("WWDR path:", wwdrPath, fs.existsSync(wwdrPath));

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template path does not exist: ${templatePath}`);
    }
    if (!fs.existsSync(signerCertPath)) {
      throw new Error(
        `Signer certificate path does not exist: ${signerCertPath}`
      );
    }
    if (!fs.existsSync(signerKeyPath)) {
      throw new Error(`Signer key path does not exist: ${signerKeyPath}`);
    }
    if (!fs.existsSync(wwdrPath)) {
      throw new Error(`WWDR path does not exist: ${wwdrPath}`);
    }

    // Read the pass.json from the template to get required fields
    const passJsonPath = path.join(templatePath, "pass.json");
    if (!fs.existsSync(passJsonPath)) {
      throw new Error(`pass.json missing: ${passJsonPath}`);
    }

    const passJson = JSON.parse(fs.readFileSync(passJsonPath, "utf8"));

    // Create a deep copy of the pass.json to avoid modifying the original template
    const updatedPassJson = JSON.parse(JSON.stringify(passJson));

    // Update the pass JSON with our values before using it as a model
    updatedPassJson.serialNumber = serialNumber;
    
    // Update headerFields with points instead of primaryFields
    if (updatedPassJson.storeCard.headerFields && updatedPassJson.storeCard.headerFields.length > 0) {
      updatedPassJson.storeCard.headerFields[0].value = points.toString();
    }
    
    // Leave primaryFields empty for the strip to show
    if (updatedPassJson.storeCard.primaryFields && updatedPassJson.storeCard.primaryFields.length > 0) {
      // Keep primaryFields structure but with empty value
      updatedPassJson.storeCard.primaryFields[0].value = "";
    }
    
    updatedPassJson.storeCard.secondaryFields[0].value = tier;
    updatedPassJson.storeCard.secondaryFields[1].value = memberNumber;

    // Always update relevantDate to current time to increase notification priority
    updatedPassJson.relevantDate = new Date().toISOString();

    // Set the current webServiceURL from ngrok
    try {
      const ngrokDataPath = path.join(__dirname, "../ngrok_url.json");
      console.log(
        "Reading ngrok URL from path:",
        ngrokDataPath,
        "exists:",
        fs.existsSync(ngrokDataPath)
      );

      const ngrokData = JSON.parse(fs.readFileSync(ngrokDataPath, "utf8"));
      console.log("Loaded ngrok data:", ngrokData);

      // Always update the webServiceURL regardless of its current value
      updatedPassJson.webServiceURL = `${ngrokData.url}/pass`;
      console.log(`Updated webServiceURL to: ${updatedPassJson.webServiceURL}`);
    } catch (error) {
      console.error("Failed to update webServiceURL:", error);
    }

    // Create a temporary file with our updated JSON but preserving all other fields
    const tempPassJsonPath = path.join(outputPath, `${serialNumber}_pass.json`);
    fs.writeFileSync(
      tempPassJsonPath,
      JSON.stringify(updatedPassJson, null, 2)
    );

    // We need to temporarily update the template file since overrides isn't working
    // Save the original file
    const originalContent = fs.readFileSync(passJsonPath, "utf8");

    // Write our updated JSON to the template
    fs.writeFileSync(passJsonPath, JSON.stringify(updatedPassJson, null, 2));

    // Create a new pass using the modified template
    console.log("Creating pass with PEM certificates...");
    try {
      const pass = await PKPass.from({
        model: templatePath,
        certificates: {
          wwdr: fs.readFileSync(wwdrPath),
          signerCert: fs.readFileSync(signerCertPath),
          signerKey: fs.readFileSync(signerKeyPath),
          signerKeyPassphrase: "Flowapt123!",
        },
      });

      // Generate the .pkpass file
      console.log("Generating pass buffer...");
      const buffer = await pass.getAsBuffer();

      // Write the buffer to a file
      const outputFilePath = path.join(outputPath, `${serialNumber}.pkpass`);
      fs.writeFileSync(outputFilePath, buffer);

      console.log(`Pass generated successfully: ${outputFilePath}`);
      return outputFilePath;
    } finally {
      // Always restore the original template
      fs.writeFileSync(passJsonPath, originalContent);
    }
  } catch (error) {
    console.error("Error generating pass:", error);
    throw error;
  }
}
*/

// Export the function for use in server.js
module.exports = { generatePass };

// If run directly, generate a sample pass
if (require.main === module) {
  const [serial, points, tier, member] = process.argv.slice(2);
  generatePass(
    serial || "1234567890",
    parseInt(points || "0"),
    tier || "Bronze",
    member || "000123456"
  ).catch((err) => {
    console.error("Failed to generate sample pass:", err);
    process.exit(1);
  });
}
