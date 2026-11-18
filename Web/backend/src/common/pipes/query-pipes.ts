// Pipes for query parameters that end up in date or integer SQL. An empty value means the
// filter was left blank and reads as absent; anything else must be exactly well-formed.
import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { isIsoDate } from '../time/business-date';

/** A real calendar day written YYYY-MM-DD. */
@Injectable()
export class IsoDatePipe implements PipeTransform<
  string | undefined,
  string | undefined
> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (!isIsoDate(value)) throw new BadRequestException('invalid_date');
    return value;
  }
}

export const MIN_REPORT_YEAR = 1900;
export const MAX_REPORT_YEAR = 2100;

/** A four-digit year; "2026junk" is refused rather than read as 2026. */
@Injectable()
export class YearPipe implements PipeTransform<
  string | undefined,
  number | undefined
> {
  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    const year = /^\d{4}$/.test(value) ? Number(value) : NaN;
    if (!(year >= MIN_REPORT_YEAR && year <= MAX_REPORT_YEAR)) {
      throw new BadRequestException('invalid_year');
    }
    return year;
  }
}

export interface YearMonth {
  year: number;
  month: number;
}

/** A calendar month written YYYY-MM, within the report years. */
@Injectable()
export class YearMonthPipe implements PipeTransform<
  string | undefined,
  YearMonth | undefined
> {
  transform(value: string | undefined): YearMonth | undefined {
    if (value === undefined || value === '') return undefined;
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
    const year = match ? Number(match[1]) : NaN;
    if (!match || !(year >= MIN_REPORT_YEAR && year <= MAX_REPORT_YEAR)) {
      throw new BadRequestException('invalid_month');
    }
    return { year, month: Number(match[2]) };
  }
}

/** A month number from 1 to 12, optionally written with a leading zero. */
@Injectable()
export class MonthPipe implements PipeTransform<
  string | undefined,
  number | undefined
> {
  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    if (!/^(0?[1-9]|1[0-2])$/.test(value)) {
      throw new BadRequestException('invalid_month');
    }
    return Number(value);
  }
}
