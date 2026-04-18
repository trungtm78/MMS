// US-SS-06: TasksModule
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { TaskAssignment } from './task-assignment.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskAssignment])],
  controllers: [TasksController],
  providers: [TasksService, JwtAuthGuard],
  exports: [TasksService],
})
export class TasksModule {}
