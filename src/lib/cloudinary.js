const { v2: cloudinary } = require('cloudinary');
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

async function uploadDataUri(dataUri, publicId) {
  const res = await cloudinary.uploader.upload(dataUri, {
    folder: config.cloudinary.folder,
    public_id: publicId,
    overwrite: true,
  });
  return res.secure_url;
}

module.exports = { cloudinary, uploadDataUri };

