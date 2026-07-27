import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { SmsService } from "./sms.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService, SmsService],
})
export class AuthModule {}
