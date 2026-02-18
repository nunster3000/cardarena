import { prisma } from "../db";

afterAll(async () => {
  await prisma.$disconnect();
});
