import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewLeaveDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

interface AuthRequest {
  user: JwtPayload;
}

@Controller()
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /** GET /leave — list leave requests (own for DQTV, all for reviewers) */
  @Get('leave')
  @UseGuards(JwtAuthGuard)
  async listLeaveRequests(
    @Request() req: AuthRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leaveService.listLeaveRequests(req.user, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** POST /leave — create a new leave request */
  @Post('leave')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createLeaveRequest(
    @Request() req: AuthRequest,
    @Body() dto: CreateLeaveDto,
  ) {
    return this.leaveService.createLeaveRequest(req.user, dto);
  }

  /** GET /leave/:id — get single leave request */
  @Get('leave/:id')
  @UseGuards(JwtAuthGuard)
  async getLeaveRequest(@Param('id') id: string) {
    return this.leaveService.getLeaveRequest(id);
  }

  /** PATCH /leave/:id/review — approve or reject a leave request */
  @Patch('leave/:id/review')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reviewLeaveRequest(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    await this.leaveService.reviewLeaveRequest(req.user, id, dto.action, dto.reason);
  }

  /** GET /leave-balances — get own leave balances */
  @Get('leave-balances')
  @UseGuards(JwtAuthGuard)
  async getLeaveBalances(@Request() req: AuthRequest) {
    return this.leaveService.getLeaveBalances(req.user.sub);
  }

  /** GET /approvals — approvals list for ApprovalsPage frontend */
  @Get('approvals')
  @UseGuards(JwtAuthGuard)
  async listApprovals(
    @Request() req: AuthRequest,
    @Query('status') status?: string,
  ) {
    return this.leaveService.listApprovals(req.user, status);
  }

  /** PUT /approvals/:id/approve — approve a leave request */
  @Put('approvals/:id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveFromApprovals(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    await this.leaveService.reviewLeaveRequest(req.user, id, 'approve', reason);
  }

  /** PUT /approvals/:id/reject — reject a leave request */
  @Put('approvals/:id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectFromApprovals(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    await this.leaveService.reviewLeaveRequest(req.user, id, 'reject', reason);
  }
}
