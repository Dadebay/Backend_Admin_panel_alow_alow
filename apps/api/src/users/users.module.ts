import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";
import { UsersService } from "./users.service";
import { CustomerController } from "./customer.controller";

@Module({
  controllers: [UsersController, AddressesController, CustomerController],
  providers: [AddressesService, UsersService],
  exports: [AddressesService],
})
export class UsersModule {}
