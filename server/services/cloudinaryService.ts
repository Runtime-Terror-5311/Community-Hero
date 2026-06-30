/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

/**
 * Uploads a base64 encoded image to Cloudinary.
 * Returns the secure URL of the uploaded image.
 */
export async function uploadToCloudinary(base64Data: string, mimeType: string): Promise<string> {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("Cloudinary is not fully configured (missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET). Using raw data URI fallback.");
    // Fallback to data URI if not configured
    return base64Data.startsWith('data:') 
      ? base64Data 
      : `data:${mimeType};base64,${base64Data}`;
  }

  return new Promise((resolve, reject) => {
    const dataUri = base64Data.startsWith('data:') 
      ? base64Data 
      : `data:${mimeType};base64,${base64Data}`;

    cloudinary.uploader.upload(
      dataUri,
      { folder: 'community_hero' },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        if (result && result.secure_url) {
          resolve(result.secure_url);
        } else {
          reject(new Error("Cloudinary upload did not return a secure URL"));
        }
      }
    );
  });
}
