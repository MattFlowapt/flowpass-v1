# FlowPass Startup Guide

This guide explains how to set up and run the FlowPass system, which consists of a loyalty pass server for Apple Wallet integrated with Supabase.

## Prerequisites

- Node.js installed
- ngrok account and ngrok installed
- Apple Developer account with pass type identifier
- Supabase project created

## Step 1: Starting the Server

Navigate to the server directory:

```bash
cd walletflow/loyalty-server
```

Start the server:

```bash
node server.js
```

The server will start on port 3000 by default.

## Step 2: Start ngrok

In a new terminal window, start ngrok to expose your local server:

```bash
ngrok http 3000
```

This will give you a public URL (e.g., `https://79cd-155-93-213-102.ngrok-free.app`) that forwards to your local server.

## Step 3: Update ngrok URL in Configuration Files

When ngrok starts, it will provide a new URL. You need to update this URL in two places:

1. Update the `ngrok_url.json` file:

```bash
cd walletflow
echo '{"url":"https://79cd-155-93-213-102.ngrok-free.app"}' > ngrok_url.json
```

2. Update the pass template file:

```bash
cd loyalty-server/passes/LoyaltyCard.pass
# Edit the pass.json file and change the webServiceURL to the new ngrok URL
# The line should look like:
# "webServiceURL": "https://79cd-155-93-213-102.ngrok-free.app/pass",
```

You can edit the file with any text editor or use this command:

```bash
sed -i '' 's|"webServiceURL": "https://.*\.ngrok-free\.app/pass"|"webServiceURL": "https://79cd-155-93-213-102.ngrok-free.app/pass"|g' pass.json
```

## Step 4: Creating and Issuing a New Pass

After updating the URLs, you can generate a new pass:

```bash
curl -X POST http://localhost:3000/api/createPass -H "Content-Type: application/json" -d '{"serialNumber": "new_pass_123", "points": 100, "tier": "Gold", "memberNumber": "MEMBER123", "authToken": "SECRET123456789ABCDEF"}'
```

This will create a new pass and return a download URL.

The generated pass will be available at:
- File: `walletflow/loyalty-server/passes/outputs/new_pass_123.pkpass`
- Download URL: `https://79cd-155-93-213-102.ngrok-free.app/download/new_pass_123.pkpass`

## Step 5: Download and Install the Pass

The pass can be downloaded from:

```
https://79cd-155-93-213-102.ngrok-free.app/download/new_pass_123.pkpass
```

Visit this URL on an iOS device to download and add the pass to Apple Wallet.

## Step 6: Testing Push Notifications and Points Update

To add points and send a push notification:

```bash
curl -X POST http://localhost:3000/api/addPoints -H "Content-Type: application/json" -d '{"serial": "new_pass_123", "pointsToAdd": 50, "customAlert": "You earned 50 bonus points!"}'
```

## Supabase Integration

The system is integrated with Supabase as a secondary storage using a dual-write pattern. Every time a pass is created or updated:

1. The data is saved to local JSON files in the `walletflow/loyalty-server/data` directory
2. The data is also sent to Supabase

The Supabase connection is configured in the `.env` file with the following variables:

```
VITE_SUPABASE_URL=https://your-supabase-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_ORGANIZATION_ID=your-organization-id
```

## Current Configuration

- Current ngrok URL: `https://79cd-155-93-213-102.ngrok-free.app`
- Sample pass download: `https://79cd-155-93-213-102.ngrok-free.app/download/updated_url_pass.pkpass`
- Local server: `http://localhost:3000`

## Troubleshooting

- If push notifications are not working, check that your device is registered by looking at the `data/registrations.json` file
- If pass updates are not being detected, verify that the ngrok URL in the pass template matches the current ngrok session
- If Supabase updates fail, check the Supabase credentials in the `.env` file

## Important Notes

- The ngrok URL changes each time you restart ngrok unless you have a paid plan
- After changing the ngrok URL, you need to regenerate passes for existing users
- The local JSON storage is the primary source of data, with Supabase serving as a secondary store

## Full Workflow for Updating ngrok URL

1. Start the server: `cd walletflow/loyalty-server && node server.js`
2. Start ngrok: `ngrok http 3000`
3. Copy the new ngrok URL
4. Update ngrok_url.json: `cd walletflow && echo '{"url":"NEW_URL"}' > ngrok_url.json`
5. Update the pass template: Edit `walletflow/loyalty-server/passes/LoyaltyCard.pass/pass.json`
6. Generate a new test pass: `curl -X POST http://localhost:3000/api/createPass -H "Content-Type: application/json" -d '{"serialNumber": "test_pass", "points": 100, "tier": "Gold", "memberNumber": "TEST123", "authToken": "SECRET123456789ABCDEF"}'`
7. Verify the pass has the correct URL: `cat walletflow/loyalty-server/passes/outputs/test_pass_pass.json | grep webServiceURL`
8. Download and test the pass: Open `https://NEW_URL/download/test_pass.pkpass` on an iOS device 




