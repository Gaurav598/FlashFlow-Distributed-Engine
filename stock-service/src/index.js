import dotenv from "dotenv";
import { app } from "./app.js";

dotenv.config({
    path: "./.env"
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
    console.log(`Stock Service running on port : ${PORT}`);
});