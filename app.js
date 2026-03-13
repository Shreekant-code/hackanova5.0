import "dotenv/config";
import express from "express";
import connect_DB from "./Database/db_connect.js";
import router from "./Routes/route.js";

const app = express();
const port = 3000;

app.use(express.json());
await connect_DB();

app.use("/", router);

app.listen(port, () => {
  console.log(`The port is running on ${port}`);
});
