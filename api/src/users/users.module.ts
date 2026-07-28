import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, AddressesController],
  providers: [AddressesService, UsersService],
  exports: [AddressesService],
})
export class UsersModule {}
