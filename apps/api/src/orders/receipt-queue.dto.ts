import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { ReceiptPrintTaskStatus } from "../generated/prisma/client";
import { ReceiptPrintPlanResponseDto } from "./orders-response.dto";

export class ClaimReceiptDto {
  @ApiProperty({
    format: "uuid",
    description: "Persistent agent ID returned by dispatch-journal-v1 health",
  })
  @IsUUID()
  stationId: string;
}
export class ReceiptLeaseDto extends ClaimReceiptDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  claimToken: string;
}
export class ReceiptOutcomeDto extends ReceiptLeaseDto {
  @ApiProperty({ enum: ["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"] })
  @IsIn(["DELIVERED", "RETRY", "UNCERTAIN", "FAILED"])
  outcome: "DELIVERED" | "RETRY" | "UNCERTAIN" | "FAILED";

  @ApiPropertyOptional({
    enum: [
      "AGENT_UNAVAILABLE",
      "PRINTER_UNAVAILABLE",
      "DELIVERY_UNCERTAIN",
      "NO_PRINTERS",
      "JOURNAL_UNAVAILABLE",
    ],
  })
  @IsOptional()
  @IsIn([
    "AGENT_UNAVAILABLE",
    "PRINTER_UNAVAILABLE",
    "DELIVERY_UNCERTAIN",
    "NO_PRINTERS",
    "JOURNAL_UNAVAILABLE",
  ])
  errorCode?: string;
}
export class ReprintReceiptDto {
  @ApiProperty({
    format: "uuid",
    description:
      "A new key means an intentional new paper copy; reuse on HTTP retry",
  })
  @IsUUID()
  idempotencyKey: string;
}
export class ReceiptTaskResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() orderNumber: number;
  @ApiProperty() documentType: string;
  @ApiProperty({ enum: ReceiptPrintTaskStatus }) status: ReceiptPrintTaskStatus;
  @ApiProperty() attempts: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() nextAttemptAt: string;
  @ApiProperty({ type: String, nullable: true }) stationId: string | null;
  @ApiProperty({ type: String, nullable: true }) lastError: string | null;
  @ApiProperty({ type: String, nullable: true }) deliveredAt: string | null;
}
export class ReceiptClaimResponseDto extends ReceiptTaskResponseDto {
  @ApiProperty() dispatchId: string;
  @ApiProperty() claimToken: string;
  @ApiProperty() leaseExpiresAt: string;
  @ApiProperty({ type: ReceiptPrintPlanResponseDto })
  plan: ReceiptPrintPlanResponseDto;
}
export class ReceiptClaimResultDto {
  @ApiProperty({ type: ReceiptClaimResponseDto, nullable: true })
  task: ReceiptClaimResponseDto | null;
}
export class ReceiptQueueResponseDto {
  @ApiProperty({ type: [ReceiptTaskResponseDto] })
  items: ReceiptTaskResponseDto[];
  @ApiProperty() pending: number;
  @ApiProperty() needsAttention: number;
}

export class ReceiptActionResponseDto {
  @ApiProperty() ok: boolean;
}
