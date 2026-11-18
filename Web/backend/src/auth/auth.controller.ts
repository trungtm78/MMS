// US-W001: Auth controller
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { AuthService } from './auth.service';
import { LOGIN_THROTTLE } from './auth-throttle';
import { MfaService } from './mfa/mfa.service';
import { requestContext, type ContextRequest } from './request-context';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

export class LoginDto {
  // Which tenant the user signs in to; required when the backend runs with
  // TENANCY_MODE=enforced and unused otherwise
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantCode?: string;

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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  // US-W001 AC-1: Login. A correct password yields tokens, an MFA challenge, or an
  // enrolment challenge (status SUCCESS / MFA_REQUIRED / MFA_SETUP_REQUIRED).
  // Second-factor routes live in MfaController under /auth/mfa.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  async login(@Body() dto: LoginDto, @Req() req: ContextRequest) {
    // Adopts the tenant into the request scope, so every query below runs under it
    await this.authService.resolveLoginTenant(dto.tenantCode, dto.password);
    const user = await this.authService.validateUser(
      dto.username,
      dto.password,
    );
    return this.mfaService.beginLogin(
      { id: user.id, username: user.username, mfaEnabled: user.mfaEnabled },
      requestContext(req),
    );
  }

  // US-W001 AC-3: Refresh tokens; the rotated session records where the request came from
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: ContextRequest) {
    return this.authService.refreshTokens(
      dto.refreshToken,
      requestContext(req),
    );
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
