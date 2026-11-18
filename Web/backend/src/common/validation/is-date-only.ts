import {
  ValidateBy,
  buildMessage,
  type ValidationOptions,
} from 'class-validator';
import { isIsoDate } from '../time/business-date';

/** A real calendar day written YYYY-MM-DD; timestamps and impossible days are refused. */
export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isIsoDate(value),
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a YYYY-MM-DD date`,
          options,
        ),
      },
    },
    options,
  );
}
