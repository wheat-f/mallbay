import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { assertBootstrapPreconditions, ensureHeadquartersAdmin, getHeadquartersAdminCandidates } from "./hq-admin-bootstrap";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:55432/mallbay?schema=public";
const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));

async function main() {
  await assertBootstrapPreconditions(prisma);
  const role = await prisma.permissionRole.findUnique({ where: { code: "HQ_ADMIN" }, select: { id: true, status: true } });
  if (!role || role.status !== "ACTIVE") throw new Error("HQ_ADMIN 角色不存在或已停用");
  const result = await ensureHeadquartersAdmin(prisma, role.id);
  console.log(JSON.stringify({ candidates: getHeadquartersAdminCandidates(), ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
