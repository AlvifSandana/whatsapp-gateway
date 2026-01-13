import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

export const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
};

export const createToken = () => randomBytes(32).toString("hex");

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
