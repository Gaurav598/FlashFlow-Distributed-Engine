import { User } from "../models/user.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";
import jwt from "jsonwebtoken";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-zA-Z0-9_.-]{3,40}$/;

const registerUser = AsyncHandler(async (req, res) => {
  const email = req.body?.email?.trim().toLowerCase();
  const username = req.body?.username?.trim().toLowerCase();
  const password = req.body?.password;
  if (!EMAIL.test(email || "") || !USERNAME.test(username || "") || typeof password !== "string" || password.length < 10) {
    throw new ApiError(400, "Valid email, username, and password of at least 10 characters are required");
  }

  const existedUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existedUser) throw new ApiError(409, "Account already exists");

  const user = await User.create({ email, username, password, role: "user" });
  const createdUser = await User.findById(user._id).select("-password");
  return res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = AsyncHandler(async (req, res) => {
  const email = req.body?.email?.trim().toLowerCase();
  const password = req.body?.password;
  if (!EMAIL.test(email || "") || typeof password !== "string") {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });
  const valid = user ? await user.isPasswordCorrect(password) : false;
  if (!valid) throw new ApiError(401, "Invalid user credentials");

  const accessToken = user.generateAccessToken();
  const loggedInUser = await User.findById(user._id).select("-password");
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: Number(process.env.ACCESS_TOKEN_COOKIE_MS || 86_400_000),
  });
  return res.status(200).json(new ApiResponse(200,
    { user: loggedInUser, accessToken }, "User logged in successfully"));
});

const validateToken = AsyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) throw new ApiError(400, "Token is required");
  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER || "flashflow-auth",
      audience: process.env.JWT_AUDIENCE || "flashflow-api",
    });
    return res.status(200).json(new ApiResponse(200,
      { isValid: true, user: decodedToken }, "Token is valid"));
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
});

export { registerUser, loginUser, validateToken };
