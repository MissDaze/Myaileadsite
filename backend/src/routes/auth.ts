import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", (req: Request, res: Response): void => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const { username, password } = parsed.data;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminUsername || !adminPassword || !jwtSecret) {
    res.status(500).json({ error: "Server authentication not configured" });
    return;
  }

  if (username !== adminUsername || password !== adminPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign({ username }, jwtSecret, { expiresIn: "7d" });
  res.json({ token, expiresIn: "7d" });
});

export default router;
