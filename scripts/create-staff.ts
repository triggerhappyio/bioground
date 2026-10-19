// Create or update a staff login for /admin.
//   npm run staff:create -- you@store.com "Full Name" ADMIN
// Prompts for the password (not echoed into shell history via argv).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "node:readline";

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const [emailArg, nameArg, roleArg] = process.argv.slice(2);
  const email = String(emailArg || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npm run staff:create -- <email> ["Full Name"] [STAFF|ADMIN]');
    process.exit(1);
  }
  const role = roleArg === "ADMIN" ? "ADMIN" : "STAFF";
  const password = process.env.STAFF_PASSWORD || (await ask("Password (min 10 chars): "));
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, role, active: true, ...(nameArg ? { name: nameArg } : {}) },
    create: { email, name: nameArg || null, passwordHash, role }
  });
  console.log(`Staff login ready: ${user.email} (${user.role})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
