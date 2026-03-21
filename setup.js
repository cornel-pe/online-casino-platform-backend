const fs = require('fs');
const path = require('path');

console.log('🚀 Spinx Backend Setup');
console.log('==========================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

if (!envExists) {
  console.log('📝 Creating .env file...');
  
  const envContent = `# Server Configuration
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/spinx

# JWT Secret (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Solana Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Cloudinary Configuration (for avatar uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=25000
WS_HEARTBEAT_TIMEOUT=60000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
`;

  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created successfully!');
  console.log('⚠️  Please update the .env file with your actual values:');
  console.log('   - JWT_SECRET: Change to a secure random string');
  console.log('   - CLOUDINARY_*: Add your Cloudinary credentials for avatar uploads');
  console.log('   - MONGODB_URI: Update if using a different MongoDB instance\n');
} else {
  console.log('✅ .env file already exists\n');
}

// Check prerequisites
console.log('🔍 Checking prerequisites...');

// Check if MongoDB is accessible
const mongoose = require('mongoose');
const testConnection = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinx';
    await mongoose.connect(mongoUri, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connection successful');
    await mongoose.disconnect();
  } catch (error) {
    console.log('❌ MongoDB connection failed');
    console.log('💡 Please make sure MongoDB is running:');
    console.log('   - Install MongoDB: https://docs.mongodb.com/manual/installation/');
    console.log('   - Start MongoDB service');
    console.log('   - Or use MongoDB Atlas: https://www.mongodb.com/cloud/atlas');
  }
};

testConnection().then(() => {
  console.log('\n🎉 Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Update .env file with your configuration');
  console.log('2. Install dependencies: npm install');
  console.log('3. Start the server: npm run dev');
  console.log('4. Test the API: http://localhost:3001/health');
  console.log('\n📚 For more information, see README.md');
}); 