import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mallbay?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const username = "xiaoming";
  const password = "Test1234!";

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    console.log(`审核员 [${username}] 已存在，跳过创建`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username,
      passwordHash,
      nickname: "小明",
      isAuditor: true
    }
  });

  console.log(`✓ 审核员 [${username}] 创建成功，初始密码：${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
