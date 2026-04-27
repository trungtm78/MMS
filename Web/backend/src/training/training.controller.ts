import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { TrainingService } from './training.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';

@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  // GET /training — list records (paginated, role-scoped)
  @Get()
  async listRecords(
    @Request() req: { user: JwtPayload },
    @Query('militiaId') militiaId?: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.trainingService.listRecords(req.user, {
      militiaId: militiaId || undefined,
      year: year > 0 ? year : undefined,
      page,
      limit,
    });
  }

  // GET /training/report — yearly training report (MUST be before /:id)
  @Get('report')
  async getReport(
    @Request() req: { user: JwtPayload },
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.trainingService.getReport(req.user, {
      year: year > 0 ? year : undefined,
      unitCode: unitCode || undefined,
    });
  }

  // GET /training/:id — get single record
  @Get(':id')
  async getRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.trainingService.getRecord(req.user, id);
  }

  // POST /training — create record
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRecord(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateTrainingDto,
  ) {
    return this.trainingService.createRecord(req.user, dto);
  }

  // PATCH /training/:id — update record
  @Patch(':id')
  async updateRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: Partial<CreateTrainingDto>,
  ) {
    return this.trainingService.updateRecord(req.user, id, dto);
  }

  // DELETE /training/:id — delete record
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecord(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
  ): Promise<void> {
    return this.trainingService.deleteRecord(req.user, id);
  }
}
