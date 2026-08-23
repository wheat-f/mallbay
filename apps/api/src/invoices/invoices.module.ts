import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesService } from "./invoices.service";
import { FinanceModule } from "../finance/finance.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { INVOICE_WORKFLOW } from "./domain/invoice-workflow";

@Module({
  imports: [PrismaModule, FinanceModule, PermissionsModule],
  controllers: [InvoicesController],
  providers: [InvoicePdfService, InvoicesService, { provide: INVOICE_WORKFLOW, useExisting: InvoicesService }],
  exports: [INVOICE_WORKFLOW, InvoicesService]
})
export class InvoicesModule {}
