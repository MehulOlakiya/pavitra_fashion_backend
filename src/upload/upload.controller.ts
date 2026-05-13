import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { UploadService } from "./upload.service";

@UseGuards(JwtAuthGuard)
@Controller("upload")
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /api/upload/image
   * Accepts a single image file (JPEG or PNG, up to 50 MB).
   * Returns { url: "<cloudinary-secure-url>" }
   */
  @Post("image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Only JPEG, PNG and WebP images are accepted.",
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException("No file uploaded.");
    }
    const url = await this.uploadService.uploadBuffer(
      file.buffer,
      file.originalname,
    );
    return { url };
  }
}
