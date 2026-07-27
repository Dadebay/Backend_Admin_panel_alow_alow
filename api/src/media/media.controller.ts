import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { AppEnv } from "../config/env";
import { Public, Roles } from "../common/auth.decorators";
import { Role } from "../generated/prisma/client";

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  @Post("images")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5_242_880, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(
          file.mimetype.startsWith("image/")
            ? null
            : new BadRequestException("Only images are accepted"),
          file.mimetype.startsWith("image/"),
        );
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Image file is required");
    let output: Buffer;
    try {
      output = await sharp(file.buffer)
        .rotate()
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Image content is invalid");
    }
    const directory = resolve(
      process.cwd(),
      this.config.get("UPLOAD_DIR", { infer: true }),
    );
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    await writeFile(resolve(directory, filename), output, { flag: "wx" });
    return {
      filename,
      url: `/api/v1/media/${filename}`,
      contentType: "image/webp",
      bytes: output.length,
    };
  }

  @Get(":filename")
  @Public()
  async read(
    @Param("filename") filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!/^[0-9a-f-]{36}\.webp$/i.test(filename)) {
      throw new NotFoundException();
    }
    const path = resolve(
      process.cwd(),
      this.config.get("UPLOAD_DIR", { infer: true }),
      filename,
    );
    try {
      await access(path);
    } catch {
      throw new NotFoundException();
    }
    response.setHeader("Content-Type", "image/webp");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return new StreamableFile(createReadStream(path));
  }
}
