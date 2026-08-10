import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { assertBootstrapPreconditions, ensureHeadquartersAdmin, ensureHeadquartersAdminRole, getHeadquartersAdminCandidates } from "./hq-admin-bootstrap";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:55432/mallbay?schema=public";
const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));

async function main() {
  const role = await ensureHeadquartersAdminRole(prisma);
  await assertBootstrapPreconditions(prisma);
  const result = await ensureHeadquartersAdmin(prisma, role.id);
  console.log(JSON.stringify({ roleId: role.id, candidates: getHeadquartersAdminCandidates(), ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
