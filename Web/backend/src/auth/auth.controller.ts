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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // US-W001 AC-1: Login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(
      dto.username,
      dto.password,
    );
    const tokens = await this.authService.issueTokens(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _pw, ...safeUser } = user as unknown as Record<
      string,
      unknown
    >;
    return { user: safeUser, tokens };
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
