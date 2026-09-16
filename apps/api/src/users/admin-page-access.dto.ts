import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsEnum, IsInt, Min } from "class-validator";
import { AdminPage, Role } from "../generated/prisma/client";

export class UpdateAdminPageAccessDto {
  @ApiProperty({ enum: AdminPage, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(AdminPage, { each: true })
  allowedPages: AdminPage[];

  @ApiProperty({ minimum: 0, description: "Current access-policy version" })
  @IsInt()
  @Min(0)
  version: number;
}

export class AdminUserPageAccessResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ nullable: true })
  firstName: string | null;

  @ApiProperty({ nullable: true })
  lastName: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ enum: AdminPage, isArray: true })
  allowedPages: AdminPage[];

  @ApiProperty({ enum: AdminPage, isArray: true })
  availablePages: AdminPage[];

  @ApiProperty({
    enum: AdminPage,
    isArray: true,
    description: "Pages granted beyond the employee's base role defaults",
  })
  expandedPages: AdminPage[];

  @ApiProperty()
  editable: boolean;

  @ApiProperty({ minimum: 0 })
  version: number;
}

export class AdminPageAccessMatrixResponseDto {
  @ApiProperty({ type: [AdminUserPageAccessResponseDto] })
  users: AdminUserPageAccessResponseDto[];
}
