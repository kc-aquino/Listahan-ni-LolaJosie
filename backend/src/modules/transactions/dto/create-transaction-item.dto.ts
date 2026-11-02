import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;
const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class CreateTransactionItemDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  itemName!: string;

  @IsString()
  @Matches(quantityPattern)
  quantity!: string;

  @IsString()
  @Matches(amountPattern)
  unitPrice!: string;
}
