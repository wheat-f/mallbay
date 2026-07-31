import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../src/prisma/prisma.service";
const p = new PrismaService(new ConfigService({ DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/mallbay?schema=public" }));
async function main() { console.log("start"); await p.$connect(); console.log(await p.permissionDefinition.count()); }
main().finally(() => p.$disconnect());