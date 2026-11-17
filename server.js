const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", text: "Связь с домом установлена" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("TamoLove запущен на порту " + PORT);
});
