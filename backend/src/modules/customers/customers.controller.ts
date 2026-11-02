import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.customersService.list(query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.id, dto);
  }

  @Get(':customerId/balances')
  getBalances(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.customersService.getBalances(customerId);
  }

  @Get(':customerId')
  getById(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.customersService.getById(customerId);
  }

  @Patch(':customerId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user.id, customerId, dto);
  }

  @Post(':customerId/archive')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.archive(user.id, customerId);
  }

  @Post(':customerId/restore')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.restore(user.id, customerId);
  }
}
