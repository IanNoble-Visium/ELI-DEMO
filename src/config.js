const dotenv = require('dotenv');
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  get mockMode() {
    return process.env.MOCK_MODE ? process.env.MOCK_MODE === 'true' : false;
  },
  databaseUrl: process.env.DATABASE_URL,
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'irex-events',
  },
};

for (const [key, val] of Object.entries({
  DATABASE_URL: config.databaseUrl,
  NEO4J_URI: config.neo4j.uri,
  NEO4J_USERNAME: config.neo4j.username,
  NEO4J_PASSWORD: config.neo4j.password,
  CLOUDINARY_CLOUD_NAME: config.cloudinary.cloudName,
  CLOUDINARY_API_KEY: config.cloudinary.apiKey,
  CLOUDINARY_API_SECRET: config.cloudinary.apiSecret,
})) {
  if (!val) {
    console.warn(`[config] Warning: missing env var ${key}`);
  }
}

module.exports = config;

