# FlowPass - Apple Wallet Pass Management System

FlowPass is a comprehensive solution for creating, managing, and updating Apple Wallet passes with real-time notifications.

## Project Structure

```
FlowPass/
├── frontend/          # React TypeScript frontend
├── backend/           # Node.js backend server
├── README.md
└── STARTUP.md
```

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Apple Developer Account (for production)
- ngrok (for local development)

### Setup

1. **Clone and install dependencies:**
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

2. **Start the backend server:**
```bash
cd backend
npm start
# Server will run on http://localhost:3000
```

3. **Start the frontend development server:**
```bash
cd frontend
npm start
# Frontend will run on http://localhost:3001
```

4. **Set up ngrok for Apple Wallet integration:**
```bash
ngrok http 3000
# Update backend/ngrok_url.json with the generated URL
```

## Features

- **Pass Creation**: Generate Apple Wallet passes with loyalty points and tiers
- **Real-time Updates**: Update pass data and push notifications to devices
- **Tier Management**: Automatically upgrade/downgrade user tiers based on points
- **Web Interface**: React frontend for pass management
- **RESTful API**: Comprehensive backend API for pass operations

## API Documentation

### Pass Management Endpoints

#### Create a New Pass
```bash
POST /api/createPass
Content-Type: application/json

{
  "userInfo": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "initialPoints": 0
}
```

#### Add Points to Pass
```bash
POST /api/addPoints
Content-Type: application/json

{
  "serial": "PASS_SERIAL_NUMBER",
  "pointsToAdd": 100
}
```

#### Update Pass Tier
```bash
POST /api/updateTier
Content-Type: application/json

{
  "serial": "PASS_SERIAL_NUMBER",
  "tier": "Gold"
}
```

#### Send Push Notification
```bash
GET /simple-push/:serial
```

#### Download Pass
```bash
GET /download/:serial.pkpass
```

### Push Notification Workflow

To update a pass and notify the user's device:

1. **Update the pass data** (add points or change tier)
2. **Send push notification** using `/simple-push/:serial`
3. **iOS Wallet app** receives notification and fetches updated pass

## Configuration

### Apple Wallet Setup

1. **Certificates**: Place your Apple Developer certificates in `backend/certificates/`
2. **Pass Type ID**: Update the pass type identifier in the pass template
3. **Web Service URL**: Ensure `webServiceURL` points to your ngrok URL + "/pass"
4. **Authentication Token**: Set consistent token across pass template and user data

### Environment Variables

Create `.env` files in both `frontend/` and `backend/` directories:

**Backend `.env**:**
```
PORT=3000
APPLE_PASS_TYPE_ID=your.pass.type.id
APPLE_TEAM_ID=your_team_id
AUTH_TOKEN=SECRET123456789ABCDEF
```

**Frontend `.env**:**
```
REACT_APP_API_URL=http://localhost:3000
```

## Development

### Backend Development
```bash
cd backend
npm run dev  # Start with nodemon for auto-reload
```

### Frontend Development
```bash
cd frontend
npm start    # Start React development server
```

### Production Build
```bash
# Build frontend
cd frontend
npm run build

# The built files will be in frontend/build/
```

## Troubleshooting

1. **Pass not updating on device**: Ensure ngrok URL is current and reachable
2. **Push notifications not working**: Check certificate validity and auth tokens
3. **Pass download fails**: Verify certificate configuration and pass signing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
