import { PrismaClient } from "@prisma/client";

// A single shared PrismaClient instance for the whole server process.
export const prisma = new PrismaClient();
