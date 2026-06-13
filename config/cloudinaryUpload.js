import cloudinary from "./cloudinary.js";

export const uploadToCloudinary = async (fileBuffer, folder = "animal-rescue") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        transformation: [
          { width: 800, height: 800, crop: "limit" }, // Optimize for web
          { quality: "auto:good" }, // Auto quality
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    return false;
  }
};