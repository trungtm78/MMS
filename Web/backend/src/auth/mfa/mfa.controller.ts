// Second-factor routes. Sign-in routes are public and driven by the mfaToken from
// POST /auth/login; management routes act on the signed-in user only.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { JwtPayload } from '../auth.service';
import { MFA_THROTTLE } from '../auth-throttle';
import { requestContext, type ContextRequest } from '../request-context';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MFA_METHODS, MfaService, type MfaMethod } from './mfa.service';

// A challenge token is "<uuid>.<43 base64url chars>" (80); codes are 6 digits or XXXXX-XXXXX
const TOKEN_MAX_LENGTH = 128;
const CODE_MAX_LENGTH = 64;

export class MfaTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TOKEN_MAX_LENGTH)
  mfaToken: string;
}

export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CODE_MAX_LENGTH)
  code: string;
}

export class MfaConfirmDto extends MfaTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CODE_MAX_LENGTH)
  code: string;
}

export class MfaVerifyDto extends MfaTokenDto {
  @IsIn(MFA_METHODS)
  method: MfaMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(CODE_MAX_LENGTH)
  code: string;
}

export class MfaDisableDto {
  @IsIn(MFA_METHODS)
  method: MfaMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(CODE_MAX_LENGTH)
  code: string;
}

// Body of the deprecated POST /auth/mfa/login
export class MfaLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TOKEN_MAX_LENGTH)
  tempToken: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(CODE_MAX_LENGTH)
  otp: string;
}

interface SignedInRequest extends ContextRequest {
  user: JwtPayload;
}

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  // Sign-in step 2: { status: SUCCESS, user, tokens, recoveryCodesRemaining? }
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(MFA_THROTTLE)
  verify(@Body() dto: MfaVerifyDto, @Req() req: ContextRequest) {
    return this.mfaService.verify(
      { mfaToken: dto.mfaToken, method: dto.method, code: dto.code },
      requestContext(req),
    );
  }

  // Deprecated: { tempToken, otp } from clients built before /auth/mfa/verify
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(MFA_THROTTLE)
  legacyLogin(@Body() dto: MfaLoginDto, @Req() req: ContextRequest) {
    return this.mfaService.verify(
      { mfaToken: dto.tempToken, method: 'totp', code: dto.otp },
      requestContext(req),
    );
  }

  // MFA_SETUP_REQUIRED step 1: secret and otpauth URI for the QR code
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @Throttle(MFA_THROTTLE)
  enroll(@Body() dto: MfaTokenDto) {
    return this.mfaService.startEnrollment(dto.mfaToken);
  }

  // MFA_SETUP_REQUIRED step 2: { status: SUCCESS, user, tokens, recoveryCodes }
  @Post('enroll/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle(MFA_THROTTLE)
  confirmEnrollment(@Body() dto: MfaConfirmDto, @Req() req: ContextRequest) {
    return this.mfaService.confirmEnrollment(
      { mfaToken: dto.mfaToken, code: dto.code },
      {},
      requestContext(req),
    );
  }

  // Voluntary enrolment from a session: { mfaToken, secret, otpauthUri, qrUri, expiresAt }
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle(MFA_THROTTLE)
  setup(@Req() req: SignedInRequest) {
    return this.mfaService.setup(req.user.sub);
  }

  // { recoveryCodes, user, tokens }: enrolling ends every session of the account, so the
  // answer carries the new one
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle(MFA_THROTTLE)
  confirm(@Body() dto: MfaConfirmDto, @Req() req: SignedInRequest) {
    return this.mfaService.confirmEnrollment(
      { mfaToken: dto.mfaToken, code: dto.code },
      { userId: req.user.sub },
      requestContext(req),
    );
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() req: SignedInRequest) {
    return this.mfaService.status(req.user.sub);
  }

  @Post('recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle(MFA_THROTTLE)
  regenerateRecoveryCodes(
    @Body() dto: MfaCodeDto,
    @Req() req: SignedInRequest,
  ) {
    return this.mfaService.regenerateRecoveryCodes(
      req.user.sub,
      dto.code,
      requestContext(req),
    );
  }

  // { user, tokens }: disabling ends every session of the account, so the answer carries
  // the new one (as POST /confirm does)
  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle(MFA_THROTTLE)
  disable(@Body() dto: MfaDisableDto, @Req() req: SignedInRequest) {
    return this.mfaService.disable(
      req.user.sub,
      { method: dto.method, code: dto.code },
      requestContext(req),
    );
  }
}

// For users who lost both their authenticator and their recovery codes
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
export class MfaAdminController {
  constructor(private readonly mfaService: MfaService) {}

  @Post(':id/mfa/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: SignedInRequest,
  ) {
    await this.mfaService.adminReset(req.user.sub, id, requestContext(req));
  }
}
