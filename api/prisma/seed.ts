import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PromoType, Role } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://alofood:alofood@localhost:5432/alofood?schema=public",
});
const prisma = new PrismaClient({ adapter });

const staff = [
  {
    phone: "+99365000001",
    firstName: "Merdan",
    lastName: "Admin",
    role: Role.ADMIN,
  },
  {
    phone: "+99365000002",
    firstName: "Aýna",
    lastName: "Operator",
    role: Role.OPERATOR,
  },
  {
    phone: "+99365000003",
    firstName: "Batyr",
    lastName: "Aşpez",
    role: Role.COOK,
  },
  {
    phone: "+99365000004",
    firstName: "Maksat",
    lastName: "Kurýer",
    role: Role.COURIER,
  },
  {
    phone: "+99365000005",
    firstName: "Oguljan",
    lastName: "Hasapçy",
    role: Role.ACCOUNTANT,
  },
];

async function main() {
  for (const member of staff) {
    await prisma.user.upsert({
      where: { phone: member.phone },
      create: member,
      update: {
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        isActive: true,
      },
    });
  }

  const burgers = await prisma.category.upsert({
  where: { slug: "burgers" },
  create: {
    name: "Бургеры",
    slug: "burgers",
    sortOrder: 10,
  },
  update: { name: "Бургеры", isActive: true },
  });
  const pizza = await prisma.category.upsert({
  where: { slug: "pizza" },
  create: {
    name: "Пицца",
    slug: "pizza",
    sortOrder: 20,
  },
  update: { name: "Пицца", isActive: true },
  });

  await prisma.product.upsert({
  where: { slug: "alo-burger" },
  create: {
    categoryId: burgers.id,
    name: "ALO Burger",
    slug: "alo-burger",
    description: "Говяжья котлета, чеддер, свежие овощи и фирменный соус.",
    price: 48,
  },
  update: {
    categoryId: burgers.id,
    description: "Говяжья котлета, чеддер, свежие овощи и фирменный соус.",
    price: 48,
    isActive: true,
  },
  });
  await prisma.product.upsert({
  where: { slug: "margherita" },
  create: {
    categoryId: pizza.id,
    name: "Маргарита",
    slug: "margherita",
    description: "Томаты, моцарелла и базилик на тонком тесте.",
    price: 65,
  },
  update: {
    categoryId: pizza.id,
    price: 65,
    isActive: true,
  },
  });

  await prisma.promoCode.upsert({
  where: { code: "WELCOME15" },
  create: {
    code: "WELCOME15",
    type: PromoType.PERCENT,
    value: 15,
    minOrderAmount: 80,
    maxDiscountAmount: 35,
    perUserLimit: 1,
  },
  update: { isActive: true },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
