import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Clamps a numeric value to a [min, max] range.
 * Does not throw — silently clamps to the nearest bound.
 *
 * Usage:
 *   @Query('page', new DefaultValuePipe(1), ParseIntPipe, new ClampPipe(1, Infinity)) page: number
 *   @Query('limit', new DefaultValuePipe(20), ParseIntPipe, new ClampPipe(1, 100)) limit: number
 */
@Injectable()
export class ClampPipe implements PipeTransform<number, number> {
  constructor(
    private readonly min: number,
    private readonly max: number,
  ) {}

  transform(value: number, _metadata: ArgumentMetadata): number {
    return Math.min(this.max, Math.max(this.min, value));
  }
}
