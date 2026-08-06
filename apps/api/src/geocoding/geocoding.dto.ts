import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsLatitude, IsLongitude } from "class-validator";

export class ReverseGeocodeQueryDto {
  @ApiProperty({ example: 37.9601 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 58.3261 })
  @Type(() => Number)
  @IsLongitude()
  lon: number;
}

export class ReverseGeocodeResponseDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Parahat 7, Görogly köçesi",
  })
  line: string | null;
}
