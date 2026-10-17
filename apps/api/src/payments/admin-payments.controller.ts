import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminPaymentsService } from './admin-payments.service';
import { SavePaymentProductDto, UpdatePaymentsSettingsDto } from './dto/admin-payments.dto';

/** godmaster's Payments tab (owner decision, 2026-10-17). ADMIN only — checked in the service. */
@Controller('admin/payments')
@UseGuards(AdminJwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get('products')
  listProducts(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.listProducts(admin);
  }

  @Post('products')
  saveProduct(@Body() dto: SavePaymentProductDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.saveProduct(dto, admin);
  }

  @Get('purchases')
  listPurchases(
    @CurrentAdmin() admin: AdminJwtPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('flagged') flagged?: string,
  ) {
    return this.adminPayments.listPurchases(admin, { search: search || undefined, status: status || undefined, flagged: flagged === 'true' });
  }

  @Post('purchases/:id/refund')
  refund(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.refund(id, admin);
  }

  @Get('settings')
  getSettings(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.getSettings(admin);
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdatePaymentsSettingsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.updateSettings(dto, admin);
  }
}
