import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  NotificationAudience,
  PushDevicePlatform,
} from "../generated/prisma/client";

export const PUSH_INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{10,255}$/;

export class RegisterPushDeviceDto {
  @ApiProperty({
    description: "Firebase Installation ID returned by the mobile FCM SDK",
    example: "c3VwcG9ydGVkLWZpcmViYXNlLWZpZA",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Matches(PUSH_INSTALLATION_ID_PATTERN)
  installationId: string;

  @ApiProperty({ enum: PushDevicePlatform })
  @IsEnum(PushDevicePlatform)
  platform: PushDevicePlatform;

  @ApiPropertyOptional({ example: "1.4.0" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional({ example: "ru-TM" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
  locale?: string;
}

export class CreateNotificationCampaignDto {
  @ApiProperty({ example: "Скидка на ужин" })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: "Сегодня с 18:00 действует скидка 15%." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({
    example: "/promotions/WELCOME15",
    description: "Internal application path opened after a notification tap",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?!\/)[^\s]*$/)
  deepLink?: string;

  @ApiPropertyOptional({
    enum: NotificationAudience,
    default: NotificationAudience.ALL_CUSTOMERS,
  })
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience: NotificationAudience = NotificationAudience.ALL_CUSTOMERS;
}

export class ListNotificationCampaignsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ListMyNotificationsQueryDto extends ListNotificationCampaignsQueryDto {}
