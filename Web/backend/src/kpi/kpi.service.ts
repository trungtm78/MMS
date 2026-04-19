import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface EvaluateDto {
  targetUserId: string;
  criteria: string[];
  scores: number[];
  recommendation: string;
  notes?: string;
}

export interface EvaluationResult {
  id: string;
  evaluatorId: string;
  targetUserId: string;
  weightedScore: number;
  recommendation: string;
  createdAt: Date;
}

const VALID_RECOMMENDATIONS = ['reward', 'maintain', 'training', 'warning', 'discipline'];
const CRITERIA_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10];

@Injectable()
export class KpiService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async submitEvaluation(
    dto: EvaluateDto,
    evaluatorId: string,
  ): Promise<EvaluationResult> {
    // Validate criteria + scores length
    if (dto.criteria.length !== 5 || dto.scores.length !== 5) {
      throw new BadRequestException('criteria_and_scores_must_have_5_items');
    }
    for (const score of dto.scores) {
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        throw new BadRequestException('scores_must_be_integers_1_to_10');
      }
    }
    if (!VALID_RECOMMENDATIONS.includes(dto.recommendation)) {
      throw new BadRequestException('invalid_recommendation');
    }

    // Verify target user exists
    const userRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE id = $1::uuid LIMIT 1`,
      [dto.targetUserId],
    );
    if (!userRows.length) throw new NotFoundException('target_user_not_found');

    // Duplicate guard: same evaluator + target within current calendar month
    const dupRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM kpi_evaluations
       WHERE evaluator_id = $1::uuid
         AND target_user_id = $2::uuid
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       LIMIT 1`,
      [evaluatorId, dto.targetUserId],
    );
    if (dupRows.length) {
      throw new ConflictException('evaluation_already_submitted_this_month');
    }

    // Calculate weighted score: weights = [30%, 25%, 20%, 15%, 10%]
    const weightedScore = dto.scores.reduce(
      (sum, score, i) => sum + score * CRITERIA_WEIGHTS[i],
      0,
    );

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO kpi_evaluations
         (evaluator_id, target_user_id, criteria, scores, weighted_score, recommendation, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        evaluatorId,
        dto.targetUserId,
        JSON.stringify(dto.criteria),
        JSON.stringify(dto.scores),
        Math.round(weightedScore * 100) / 100,
        dto.recommendation,
        dto.notes ?? null,
      ],
    );

    return {
      id: inserted[0].id,
      evaluatorId,
      targetUserId: dto.targetUserId,
      weightedScore: Math.round(weightedScore * 100) / 100,
      recommendation: dto.recommendation,
      createdAt: new Date(),
    };
  }
}
