const path = require("path");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { env } = require("../config/env");
const { HttpError } = require("../utils/httpError");

const extensionByMimeType = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

let storageClient;

function getStorageClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new HttpError(503, "Image storage is not configured");
  }

  if (!storageClient) {
    storageClient = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return storageClient;
}

function getFileExtension(file) {
  const originalExtension = path.extname(file.originalname || "").toLowerCase();
  const expectedExtension = extensionByMimeType[file.mimetype];

  return Object.values(extensionByMimeType).includes(originalExtension)
    ? originalExtension
    : expectedExtension;
}

function getStoragePathFromUrl(imageUrl) {
  if (!imageUrl || !env.supabaseUrl) {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const baseUrl = new URL(env.supabaseUrl);
    const prefix = `/storage/v1/object/public/${env.supabaseStorageBucket}/`;

    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(prefix)) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function isOwnedStoragePath(storagePath, userId) {
  return Boolean(storagePath && userId && storagePath.split("/")[1] === userId);
}

async function uploadImage({ file, folder, userId }) {
  const extension = getFileExtension(file);
  const storagePath = `${folder}/${userId}/${randomUUID()}${extension}`;
  const client = getStorageClient();
  const { error } = await client.storage
    .from(env.supabaseStorageBucket)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    console.error("Supabase Storage upload failed:", error.message);
    throw new HttpError(502, "Failed to upload image");
  }

  const { data } = client.storage.from(env.supabaseStorageBucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function deleteOwnedImage(imageUrl, userId) {
  const storagePath = getStoragePathFromUrl(imageUrl);

  if (!isOwnedStoragePath(storagePath, userId)) {
    return false;
  }

  const { error } = await getStorageClient().storage
    .from(env.supabaseStorageBucket)
    .remove([storagePath]);

  if (error) {
    console.error(`Supabase Storage delete failed for ${storagePath}:`, error.message);
    return false;
  }

  return true;
}

async function deleteOwnedImages(imageUrls, userId) {
  const paths = [...new Set(imageUrls)]
    .map(getStoragePathFromUrl)
    .filter((storagePath) => isOwnedStoragePath(storagePath, userId));

  if (paths.length === 0) {
    return;
  }

  try {
    const { error } = await getStorageClient().storage
      .from(env.supabaseStorageBucket)
      .remove(paths);

    if (error) {
      console.error("Supabase Storage batch delete failed:", error.message);
    }
  } catch (error) {
    console.error("Supabase Storage batch delete failed:", error.message);
  }
}

module.exports = {
  deleteOwnedImage,
  deleteOwnedImages,
  getStoragePathFromUrl,
  uploadImage,
};
