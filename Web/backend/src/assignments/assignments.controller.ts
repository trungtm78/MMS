import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  // POST /assignments — system_admin only
  @Post()
  @Roles('system_admin')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAssignmentDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.assignmentsService.createAssignment(dto, req.user.sub);
  }

  // DELETE /assignments/:id — system_admin only
  @Delete(':id')
  @Roles('system_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ) {
    return this.assignmentsService.removeAssignment(id, {
      sub: req.user.sub,
      role: req.user.role,
    });
  }

  // GET /assignments?caUserId= — admin sees any; ca_officer/police_ward/police_area sees own
  @Get()
  @Roles('system_admin', 'ca_officer', 'police_ward', 'police_area')
  list(
    @Query('caUserId') caUserId: string | undefined,
    @Request() req: { user: JwtPayload },
  ) {
    return this.assignmentsService.listByCa(caUserId, {
      sub: req.user.sub,
      role: req.user.role,
    });
  }
}
