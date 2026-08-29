import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Администратор",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  const haircuts = await prisma.serviceCategory.upsert({
    where: { id: "cat-haircuts" },
    update: {},
    create: { id: "cat-haircuts", name: "Стрижки", order: 1 },
  });

  const coloring = await prisma.serviceCategory.upsert({
    where: { id: "cat-coloring" },
    update: {},
    create: { id: "cat-coloring", name: "Окрашивание", order: 2 },
  });

  const services = await Promise.all([
    // Price is intentionally left unset here — it's optional and should be
    // filled in for real via the admin services page, not hardcoded demo data.
    prisma.service.upsert({
      where: { id: "srv-haircut-m" },
      update: {},
      create: {
        id: "srv-haircut-m",
        name: "Мужская стрижка",
        categoryId: haircuts.id,
        durationMin: 45,
      },
    }),
    prisma.service.upsert({
      where: { id: "srv-haircut-beard" },
      update: {},
      create: {
        id: "srv-haircut-beard",
        name: "Стрижка + моделирование бороды",
        categoryId: haircuts.id,
        durationMin: 60,
      },
    }),
    prisma.service.upsert({
      where: { id: "srv-color" },
      update: {},
      create: {
        id: "srv-color",
        name: "Окрашивание в один тон",
        categoryId: coloring.id,
        durationMin: 90,
      },
    }),
  ]);

  // No demo masters on purpose: production seeding should only ever create
  // the admin account. Masters are real staff — they must be added by the
  // admin through /admin/masters after deploy, with their own real phone
  // number and password, not a shared demo login left in the database.

  console.log("Seed complete. Admin login:", adminEmail, "/", adminPassword);
  console.log("No demo masters were created — add real masters via /admin/masters.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
