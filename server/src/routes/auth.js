import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const router = Router();

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

router.post("/signup", async (request, response) => {
  const { f_name, l_name, username, password } = request.body;

  if ([f_name, l_name, username, password].some(isBlank)) {
    return response.status(400).json({
      message: "Add your name, username, and password to get started."
    });
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    const existingUser = await User.findOne({ username: normalizedUsername });

    if (existingUser) {
      return response.status(409).json({
        message: "That username's taken. Try another one."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      f_name: f_name.trim(),
      l_name: l_name.trim(),
      username: normalizedUsername,
      password: hashedPassword
    });

    return response.status(201).json({
      message: `You're all set, ${user.f_name}! You can log in now.`,
      user: {
        _id: user._id,
        f_name: user.f_name,
        l_name: user.l_name,
        username: user.username
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        message: "That username's taken. Try another one."
      });
    }

    console.error("Signup error:", error);
    return response.status(500).json({
      message: "Couldn't create your account right now. Try again."
    });
  }
});

router.post("/login", async (request, response) => {
  const { username, password } = request.body;

  if ([username, password].some(isBlank)) {
    return response.status(400).json({
      message: "Enter your username and password to log in."
    });
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    const user = await User.findOne({ username: normalizedUsername });

    if (!user) {
      return response.status(404).json({
        message: "We couldn't find that username. Try again or create an account."
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return response.status(401).json({
        message: "That password didn't match. Give it another try."
      });
    }

    return response.json({
      message: `Welcome back, ${user.f_name}!`,
      user: {
        _id: user._id,
        f_name: user.f_name,
        l_name: user.l_name,
        username: user.username
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return response.status(500).json({
      message: "Couldn't log you in right now. Try again."
    });
  }
});

export default router;
