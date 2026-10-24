import { Body, Controller, Get, Param, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { CurrentAdmin } from '../admin/decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminPaymentsService } from './admin-payments.service';
import { GenerateAuditFileDto, SavePaymentProductDto, UpdatePaymentsSettingsDto, UpdateSellerDto } from './dto/admin-payments.dto';

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

  // Sale documents and the NRA audit file (owner decision, 2026-10-23).
  @Get('seller')
  getSeller(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.getSeller(admin);
  }

  @Put('seller')
  updateSeller(@Body() dto: UpdateSellerDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.updateSeller(dto, admin);
  }

  @Get('documents')
  listDocuments(@CurrentAdmin() admin: AdminJwtPayload, @Query('month') month: string, @Query('mode') mode?: string) {
    return this.adminPayments.listDocuments(admin, month, mode === 'test' || mode === 'all' ? mode : 'live');
  }

  @Get('documents/:id')
  getDocument(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.getDocument(admin, id);
  }

  @Get('audit-files')
  listAuditFiles(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.listAuditFiles(admin);
  }

  @Post('audit-files')
  generateAuditFile(@Body() dto: GenerateAuditFileDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.adminPayments.generateAuditFile(dto, admin);
  }

  @Post('audit-files/test')
  async testAuditFile(@Body() dto: GenerateAuditFileDto, @CurrentAdmin() admin: AdminJwtPayload, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.adminPayments.testAuditFile(dto, admin);
    res.set({ 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Content-Type': 'application/xml; charset=utf-8' });
    return new StreamableFile(file.bytes);
  }

  @Get('audit-files/:id/download')
  async downloadAuditFile(@Param('id') id: string, @CurrentAdmin() admin: AdminJwtPayload, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.adminPayments.downloadAuditFile(admin, id);
    res.set({ 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Content-Type': 'application/xml; charset=utf-8' });
    return new StreamableFile(file.bytes);
  }
}
