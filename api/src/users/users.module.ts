import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";

@Module({
  controllers: [UsersController, AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class UsersModule {}
