import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { BranchesModule } from "../branches/branches.module";
import { RoutingModule } from "../routing/routing.module";
import { TrackingModule } from "../tracking/tracking.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [UsersModule, BranchesModule, TrackingModule, RoutingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
