import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>("CLOUDINARY_CLOUD_NAME"),
      api_key: this.config.get<string>("CLOUDINARY_API_KEY"),
      api_secret: this.config.get<string>("CLOUDINARY_API_SECRET"),
    });
  }

  /**
   * Upload a file buffer to Cloudinary.
   * Quality is preserved as-is (quality: 100, no transformation applied).
   * Returns the secure public URL.
   */
  async uploadBuffer(buffer: Buffer, originalName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const folder =
        this.config.get<string>("CLOUDINARY_FOLDER") ?? "pavitra_fashion";

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `${Date.now()}_${originalName.replace(/\.[^/.]+$/, "")}`,
          resource_type: "image",
          quality: 100, // preserve original quality
          fetch_format: "auto",
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(
              new InternalServerErrorException(
                error?.message ?? "Cloudinary upload failed",
              ),
            );
          } else {
            resolve(result.secure_url);
          }
        },
      );

      uploadStream.end(buffer);
    });
  }
}
