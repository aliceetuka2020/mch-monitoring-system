import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient(process.env.DATABASE_URL ? {
  datasources: { db: { url: process.env.DATABASE_URL } },
} : {});

export default prisma;
