import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN" },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: "STAFF" },
    update: {},
    create: { name: "STAFF" },
  });

  const username = "admin";
  const password = "admin123";
  const hash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      password: hash,
      status: "ACTIVE",
      roles: {
        create: [{ roleId: adminRole.id }, { roleId: staffRole.id }],
      },
    },
    include: { roles: { include: { role: true } } },
  });

  console.log("Seeded admin user:", { username: admin.username, password });

  // Seed a default staff profile for the admin (optional but useful for logs/timeline)
  await prisma.staff.upsert({
    where: { userId: admin.id },
    update: { name: "Admin", status: "ACTIVE" },
    create: {
      name: "Admin",
      phone: "",
      position: "Owner",
      salary: "0",
      status: "ACTIVE",
      userId: admin.id,
    },
  });


// Seed a default walk-in customer used as fallback in the UI
const existingWalkIn = await prisma.customer.findFirst({
  where: { name: { equals: "Walk-in", mode: "insensitive" } },
});
if (!existingWalkIn) {
  await prisma.customer.create({
    data: {
      name: "Walk-in",
      phone: "",
      address: "",
      notes: "Default customer for quick tickets",
    },
  });
}


  // Seed default shoe-repair service catalog (KHR)
  const services = [
    { name: "ជួសស្បែកជើងខូច - Sewing repair", defaultPrice: 25000, minutes: 0 },
    { name: "ប្ដូរចុងកែងកៅស៊ូ", defaultPrice: 5000, minutes: 0 },
    { name: "ប្ដូរចុងកែងដែក", defaultPrice: 10000, minutes: 0 },
    { name: "ប្ដូរតែមជើង + សេវាកាត់ការ", defaultPrice: 100000, minutes: 0 },
  ];

  for (const s of services) {
    await prisma.repairService.upsert({
      where: { name: s.name },
      update: { active: true },
      create: {
        name: s.name,
        defaultPrice: s.defaultPrice.toString(),
        defaultDurationMin: s.minutes,
        active: true,
      },
    });
  }

  console.log("Seeded repair services:", services.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
