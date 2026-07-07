import { app } from "./app.js";
import { config } from "./config/config.js";

app.listen(config.port, () => {
    console.log(`🚀 API Gateway running on port : ${config.port}`);
});