import { User } from "../models/user.model.js";

export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email && !username && !password) return;
  if (!email || !username || !password || password.length < 12) {
    throw new Error("All bootstrap admin variables are required and the password must be at least 12 characters");
  }
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    if (existing.email !== email || existing.username !== username) {
      throw new Error("Bootstrap admin identity conflicts with an existing account");
    }
    if (existing.role !== "admin") {
      existing.role = "admin";
      await existing.save();
    }
    return;
  }
  try {
    await User.create({ email, username, password, role: "admin" });
    console.log("Bootstrap administrator created");
  } catch (error) {
    // Multiple replicas may race during a rollout. A unique-key loser re-reads
    // the winner rather than failing its pod startup.
    if (error?.code !== 11000) throw error;
    const winner = await User.findOne({ email, username, role: "admin" });
    if (!winner) throw error;
  }
}
