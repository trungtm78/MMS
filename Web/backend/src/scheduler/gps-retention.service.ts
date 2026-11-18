import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GpsRetentionService {
  private readonly logger = new Logger(GpsRetentionService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('0 2 * * *') // every day at 02:00
  async purgeOldGpsPoints(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    try {
      // The Postgres driver answers a DELETE without RETURNING with [rows, rowCount]
      const [, deleted] = await this.dataSource.query<
        [unknown[], number | null]
      >(`DELETE FROM gps_points WHERE captured_at < $1::timestamptz`, [
        cutoff.toISOString(),
      ]);
      this.logger.log(
        `GPS retention: deleted ${deleted ?? 0} rows older than 90 days`,
      );
    } catch (err) {
      this.logger.error('GPS retention: failed to purge old GPS points', err);
    }
  }
}
