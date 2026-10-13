import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3002);
const app = createApp();

app.listen(port, () => {
  console.log(`Hint, Darling API listening on http://localhost:${port}`);
});
