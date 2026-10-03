import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { rawRequest } from "./api";
import { ApiError } from "./errors";

/**
 * Product photos.
 *
 * A shop's pictures are small (a shelf label, not a magazine) and the server
 * keeps them in Postgres, so the phone does the shrinking: pick or shoot,
 * downscale to 800px on the long edge, JPEG at 0.6, upload the bytes. What
 * leaves the phone is roughly 60-150 KB, which is one request over any shop's
 * data bundle.
 *
 * expo-image-picker and expo-image-manipulator both support web, so the browser
 * export is unaffected; the picker just refuses to run there.
 */

/** Long edge, in pixels. Big enough to read a label, small enough to send. */
const MAX_EDGE = 800;
const JPEG_QUALITY = 0.6;

export type PhotoSource = "camera" | "library";

export type PhotoResult =
  | { ok: true; bytes: number }
  | { ok: false; cancelled?: boolean; message?: string };

async function compressToJpegBase64(uri: string): Promise<{ data: string; width: number; height: number }> {
  // New SDK 57 API: manipulate() -> (chainable ops) -> renderAsync() ->
  // saveAsync({ base64: true }). The legacy manipulateAsync() is deprecated.
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_EDGE, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!saved.base64) throw new Error("Could not read that photo");
  return { data: saved.base64, width: saved.width, height: saved.height };
}

/**
 * Ask the shopkeeper where the photo comes from, shrink it, and send it to the
 * product. Cancelling the picker is not an error - the screen simply stays as
 * it was.
 */
export async function pickAndUploadProductImage(
  productId: string,
  source: PhotoSource,
): Promise<PhotoResult> {
  try {
    let uri: string;
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, message: "Oloja needs the camera to take a product photo" };
      }
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
          });

    if (result.canceled || !result.assets[0]?.uri) return { ok: false, cancelled: true };
    uri = result.assets[0].uri;

    const { data, width, height } = await compressToJpegBase64(uri);
    const response = await rawRequest<{ bytes: number }>("PUT", `/api/products/${productId}/image`, {
      data,
      width,
      height,
    });
    return { ok: true, bytes: response.bytes };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: err.message };
    return {
      ok: false,
      message:
        Platform.OS === "web"
          ? "Photos are not supported in the browser build yet"
          : "That photo could not be read. Try another one.",
    };
  }
}

export async function removeProductImage(productId: string): Promise<PhotoResult> {
  try {
    await rawRequest("DELETE", `/api/products/${productId}/image`);
    return { ok: true, bytes: 0 };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Could not remove the photo" };
  }
}

/**
 * Where the photo lives, for expo-image. Null when the product has none.
 *
 * `imageVersion` (the clock the server stamped on the photo) goes in the query
 * string. Without it a replaced photo keeps the same URL, and expo-image would
 * happily show the old one from its cache for the rest of the day.
 */
export function productImageUrl(
  productId: string,
  hasImage: boolean,
  imageVersion?: string | null,
  apiUrl?: string,
): string | null {
  if (!hasImage) return null;
  const raw =
    apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "http://localhost:4000" : "");
  const base = raw.replace(/\/+$/, "");
  const version = imageVersion ? `?v=${encodeURIComponent(imageVersion)}` : "";
  return `${base}/api/products/${productId}/image${version}`;
}