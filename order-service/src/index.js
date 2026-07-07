import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

dotenv.config({
  path: "./.env",
});

const PORT = process.env.PORT || 3003;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Order Service running on port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.log("MONGO db connection failed !!! ", error);
  });
