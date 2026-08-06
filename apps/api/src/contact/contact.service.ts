import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toApiResponse } from "../common/api-response";
import { UpdateContactSettingsDto } from "./contact.dto";

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const value = await this.prisma.contactSettings.upsert({
      where: { id: "default" }, create: { id: "default", displayName: "AloWAlow Destek", phone: "+99312000000" }, update: {},
    });
    return toApiResponse(value);
  }
  async update(dto: UpdateContactSettingsDto) {
    return toApiResponse(await this.prisma.contactSettings.upsert({ where: { id: "default" }, create: { id: "default", ...dto }, update: dto }));
  }
}
