import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  NotificationAudience,
  NotificationCampaignStatus,
  PushDevicePlatform,
} from "../generated/prisma/client";

export class PushDeviceResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ description: "Firebase Installation ID" })
  installationId: string;

  @ApiProperty({ enum: PushDevicePlatform })
  platform: PushDevicePlatform;

  @ApiPropertyOptional({ nullable: true, type: String })
  appVersion: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  locale: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: "date-time" })
  lastSeenAt: string;
}

export class NotificationCreatorResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  firstName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastName: string | null;
}

export class NotificationCampaignResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  deepLink: string | null;

  @ApiProperty({ enum: NotificationAudience })
  audience: NotificationAudience;

  @ApiProperty({ enum: NotificationCampaignStatus })
  status: NotificationCampaignStatus;

  @ApiProperty()
  intendedUserCount: number;

  @ApiProperty()
  deviceCount: number;

  @ApiProperty()
  sentCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiPropertyOptional({ nullable: true, format: "date-time", type: String })
  startedAt: string | null;

  @ApiPropertyOptional({ nullable: true, format: "date-time", type: String })
  completedAt: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ type: NotificationCreatorResponseDto })
  createdBy: NotificationCreatorResponseDto;
}

export class NotificationCampaignListResponseDto {
  @ApiProperty({ type: [NotificationCampaignResponseDto] })
  items: NotificationCampaignResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  pages: number;
}

export class UserNotificationResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  deepLink: string | null;

  @ApiPropertyOptional({ nullable: true, format: "date-time", type: String })
  readAt: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: string;
}

export class UserNotificationListResponseDto {
  @ApiProperty({ type: [UserNotificationResponseDto] })
  items: UserNotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  unread: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  pages: number;
}

export class UnreadNotificationCountResponseDto {
  @ApiProperty()
  unread: number;
}

export class MarkNotificationReadResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "date-time" })
  readAt: string;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty()
  updated: number;
}
