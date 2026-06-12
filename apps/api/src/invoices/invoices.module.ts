import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [PrismaModule],
  controllers: [InvoicesController],
  providers: [InvoicePdfService, InvoicesService],
  exports: [InvoicesService]
})
export class InvoicesModule {}
