import jsQR from "jsqr";

/**
 * QR decoding service.
 *
 * The interface is intentionally thin so an IPC-backed decoder can
 * replace the canvas-based image decoder later without touching the
 * ImportQR page.
 */

export interface QrDecoder {
	decodeImage(data: ImageData): string | null;
}

class ImageQrDecoder implements QrDecoder {
	decodeImage(data: ImageData): string | null {
		const result = jsQR(data.data, data.width, data.height, {
			inversionAttempts: "attemptBoth",
		});
		return result?.data ?? null;
	}
}

export const imageQrDecoder: QrDecoder = new ImageQrDecoder();

/**
 * Reads a File into an ImageBitmap, then decodes any QR payload
 * it contains. Returns the raw QR text (typically an otpauth:// URI).
 */
export async function decodeQrFromFile(file: File): Promise<string | null> {
	const bitmap = await createImageBitmap(file);

	try {
		const canvas = document.createElement("canvas");
		const maxDimension = 1024;
		const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));

		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return null;

		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
		return imageQrDecoder.decodeImage(imageData);
	} finally {
		bitmap.close();
	}
}
