import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RecruitmentApplication } from './entities/recruitment-application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class RecruitmentService {
  constructor(
    @InjectRepository(RecruitmentApplication)
    private repo: Repository<RecruitmentApplication>,
  ) {}

  async listApplications(filters: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: RecruitmentApplication[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const where: Record<string, unknown> = { deletedAt: IsNull() };
    if (filters.status) where['status'] = filters.status;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async createApplication(
    dto: CreateApplicationDto,
    userId: string,
  ): Promise<RecruitmentApplication> {
    const app = this.repo.create({
      ...dto,
      applyDate: new Date().toISOString().slice(0, 10),
      status: 'new',
      createdBy: userId,
    });
    return this.repo.save(app);
  }

  async getApplicationById(id: string): Promise<RecruitmentApplication> {
    const app = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!app) throw new NotFoundException('application_not_found');
    return app;
  }

  async updateApplication(
    id: string,
    dto: UpdateApplicationDto,
    userId: string,
  ): Promise<RecruitmentApplication> {
    const app = await this.getApplicationById(id);
    if (dto.status !== undefined) {
      app.status = dto.status;
      app.reviewedBy = userId;
      app.reviewedAt = new Date();
    }
    if (dto.reviewerNotes !== undefined) {
      app.reviewerNotes = dto.reviewerNotes;
    }
    return this.repo.save(app);
  }

  async deleteApplication(id: string, userId: string, isAdmin: boolean): Promise<void> {
    if (!isAdmin) throw new ForbiddenException('only_admin_can_delete');
    const app = await this.getApplicationById(id);
    app.deletedAt = new Date();
    await this.repo.save(app);
  }
}
