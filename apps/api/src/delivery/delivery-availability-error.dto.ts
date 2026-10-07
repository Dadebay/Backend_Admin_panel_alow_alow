import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DeliveryAvailabilityErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: "Bad Request" })
  error: string;

  @ApiProperty({
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    example:
      "По этому адресу доставка пока недоступна. Обслуживаем Ахалский велаят и Ашхабад.",
  })
  message: string | string[];

  @ApiPropertyOptional({
    enum: ["OUTSIDE_DELIVERY_AREA", "DELIVERY_LOCATION_REQUIRED"],
    description:
      "Stable delivery availability code; absent for other validation errors",
  })
  code?: "OUTSIDE_DELIVERY_AREA" | "DELIVERY_LOCATION_REQUIRED";
}
