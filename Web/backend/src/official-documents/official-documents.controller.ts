import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { OfficialDocumentsService } from './official-documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class CreateDocDto {
  @IsOptional() @IsString()
  docNumber?: string;

  @IsString() @IsNotEmpty()
  docType: string;

  @IsString() @IsNotEmpty()
  title: string;

  @IsOptional() @IsString()
  issuedBy?: string;

  @IsOptional() @IsString()
  issuedDate?: string;

  @IsOptional() @IsString()
  effectiveDate?: string;

  @IsOptional() @IsString()
  expiryDate?: string;

  @IsOptional() @IsString()
  subject?: string;

  @IsOptional() @IsString()
  fileId?: string;

  @IsOptional() @IsString()
  relatedMilitiaId?: string;

  @IsOptional() @IsString()
  relatedUnitId?: string;
}

@Controller('official-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer')
export class OfficialDocumentsController {
  constructor(private readonly service: OfficialDocumentsService) {}

  @Get()
  list(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.list({ type, status, page, limit });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateDocDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: Partial<CreateDocDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string) {
    await this.service.revoke(id);
  }
}
