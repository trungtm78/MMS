// US-W001: Auth controller
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from './auth.service';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class MfaLoginDto {
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class MfaConfirmDto {
  @IsString()
  @IsNotEmpty()
  otp: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // US-W001 AC-1: Login — returns MFA challenge if mfa_enabled, else tokens
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(
      dto.username,
      dto.password,
    );

    // MFA additive flow: if mfa_enabled, return temp token for OTP challenge
    if ((user as unknown as Record<string, unknown>)['mfaEnabled'] === true) {
      const tempToken = await this.authService.issueMfaTempToken(user.id);
      return { mfa_required: true, tempToken };
    }

    const tokens = await this.authService.issueTokens(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _pw, mfaEnabled: _mfa, ...safeUser } = user as unknown as Record<
      string,
      unknown
    >;
    return { user: safeUser, tokens };
  }

  // MFA step 2: exchange temp token + OTP for full token pair
  @Post('mfa/login')
  @HttpCode(HttpStatus.OK)
  async mfaLogin(@Body() dto: MfaLoginDto) {
    const { user, ...tokens } = await this.authService.verifyMfaAndIssueTokens(
      dto.tempToken,
      dto.otp,
    );
    return { user, tokens };
  }

  // MFA setup step 1: generate TOTP secret + QR URI + recovery codes
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async mfaSetup(@Request() req: { user: JwtPayload }) {
    return this.authService.setupMfa(req.user.sub);
  }

  // MFA setup step 2: confirm OTP to enable MFA
  @Post('mfa/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async mfaConfirm(
    @Request() req: { user: JwtPayload },
    @Body() dto: MfaConfirmDto,
  ) {
    await this.authService.confirmMfaSetup(req.user.sub, dto.otp);
  }

  // US-W001 AC-3: Refresh tokens
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // US-W001 AC-5: Logout
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Request() req: { user: { sub: string } }) {
    await this.authService.logout(req.user.sub);
  }

  // Get current user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: { user: { sub: string } }) {
    return this.authService.getUserById(req.user.sub);
  }
}
