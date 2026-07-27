import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/auth.decorators";
import { AuthService } from "./auth.service";
import { RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: "Request a one-time login code by phone" })
  request(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto, ip);
  }

  @Post("otp/verify")
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: "Verify code and create or sign in a user" })
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Rotate refresh token and issue a new session" })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke a refresh token" })
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
