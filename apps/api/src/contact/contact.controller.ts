import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AdminPages, Public, Roles } from "../common/auth.decorators";
import { AdminPage, Role } from "../generated/prisma/client";
import { UpdateContactSettingsDto } from "./contact.dto";
import { ContactSettingsResponseDto } from "./contact-response.dto";
import { ContactService } from "./contact.service";

@ApiTags("contacts")
@Controller("contacts")
export class ContactController {
  constructor(private readonly contacts: ContactService) {}
  @Get()
  @Public()
  @ApiOkResponse({ type: ContactSettingsResponseDto })
  get() {
    return this.contacts.get();
  }

  @Put()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @AdminPages(AdminPage.CONTACTS)
  @ApiOkResponse({ type: ContactSettingsResponseDto })
  update(@Body() dto: UpdateContactSettingsDto) {
    return this.contacts.update(dto);
  }
}
