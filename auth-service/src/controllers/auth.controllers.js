import { User } from "../models/user.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";
import jwt from "jsonwebtoken";

const registerUser = AsyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  if ([email, username, password].some((field) => field?.trim() === "")) {
    return res
      .status(400)
      .json(new ApiError(400, "All field are required"));
  }

  const existedUser = await User.findOne({ email });
  if (existedUser) {
    return res
      .status(409)
      .json(new ApiError(409, "User with email or username already exists"));
  }

  const user = await User.create({ email, username, password });
  const createdUser = await User.findById(user._id).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = AsyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json(new ApiError(400, "Email and password are required"));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(404)
      .json(new ApiError(404, "User does not exist"));
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    return res
      .status(401)
      .json(new ApiError(401, "Invalid user credentials"));
  }

  const accessToken = user.generateAccessToken();
  const loggedInUser = await User.findById(user._id).select("-password");

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  res.cookie("accessToken", accessToken, options)

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "User logged in successfully",
      ),
    );
});

const validateToken = AsyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res
      .status(409)
      .json(new ApiError(409, "Token is required"));
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken?._id).select("-password");
    if (!user) {
      return res
      .status(401)
      .json(new ApiError(401, "Invalid Token"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { isValid: true, user }, "Token is valid"));
  } catch (error) {
    throw new ApiError(401, "Invalid or Expired Token");
  }
});

export { registerUser, loginUser, validateToken };
