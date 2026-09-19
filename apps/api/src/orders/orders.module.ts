import { ReceiptQueueController } from "./receipt-queue.controller";
import { ReceiptAgentController } from "./receipt-agent.controller";
import { ReceiptAgentGuard } from "./receipt-agent.guard";
import { ReceiptQueueService } from "./receipt-queue.service";
import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { UsersModule } from "../users/users.module";
import { BranchesModule } from "../branches/branches.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RoutingModule } from "../routing/routing.module";
import { TrackingModule } from "../tracking/tracking.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    InventoryModule,
    UsersModule,
    BranchesModule,
    TrackingModule,
    RoutingModule,
    NotificationsModule,
    DeliveryModule,
  ],
  controllers: [
    OrdersController,
    ReceiptQueueController,
    ReceiptAgentController,
  ],
  providers: [OrdersService, ReceiptQueueService, ReceiptAgentGuard],
})
export class OrdersModule {}
