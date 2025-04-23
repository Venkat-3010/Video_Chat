const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*"
    }
});

const PORT = 5000;
let activeSockets = [];

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  if (!activeSockets.includes(socket.id)) {
    activeSockets.push(socket.id);

    socket.emit("update-user-list", {
      users: activeSockets.filter((id) => id !== socket.id),
    });

    socket.broadcast.emit("update-user-list", {
      users: [socket.id],
    });
  }

  socket.on("call-user", (data) => {
    io.to(data.to).emit("call-made", {
      offer: data.offer,
      socket: socket.id,
    });
  });

  socket.on("make-answer", (data) => {
    io.to(data.to).emit("answer-made", {
      socket: socket.id,
      answer: data.answer,
    });
  });

  socket.on("reject-call", (data) => {
    io.to(data.from).emit("call-rejected", {
      socket: socket.id,
    });
  });

  socket.on("disconnect", () => {
    activeSockets = activeSockets.filter((id) => id !== socket.id);
    socket.broadcast.emit("remove-user", {
      socketId: socket.id,
    });
    console.log("Disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
