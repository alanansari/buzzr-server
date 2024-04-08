import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

class SocketService {
  private _io: Server;
  private prisma: PrismaClient;
  constructor() {
    console.log("Init Socket Service...");

    this._io = new Server({
      cors: {
        allowedHeaders: ["*"],
        origin: "*",
      },
    });

    this.prisma = new PrismaClient();
  }

  public initListeners() {
    const io = this.io;
    console.log("Init Socket Listeners...");

    io.on("connection", async (socket) => {
      console.log("New connection:", socket.id);

      const userType = socket.handshake.query.userType as string;
      const playerId = socket.handshake.query.playerId as string;
      const adminId = socket.handshake.query.adminId as string;

      let player;

      if (userType === "player") {
        player = await this.prisma.player.findUnique({
          where: {
            id: playerId,
          },
        });

        if (!player) {
          console.log(
            "Player",
            playerId,
            "not found... \nDisconnecting Socket:",
            socket.id
          );
          socket.disconnect();
          return;
        }
      } else if (userType === "admin") {
        const admin = await this.prisma.user.findUnique({
          where: {
            id: adminId,
          },
        });

        if (!admin) {
          console.log(
            "Admin: ",
            adminId,
            "not found... \nDisconnecting Socket:",
            socket.id
          );
          socket.disconnect();
          return;
        }
      } else {
        console.log(
          "Invalid userType:",
          userType,
          "\nDisconnecting Socket:",
          socket.id
        );
        socket.disconnect();
        return;
      }
      const gameCode = socket.handshake.query.gameCode as string;

      const game = await this.prisma.gameSession.findUnique({
        where: {
          gameCode,
        },
      });

      if (!game) {
        console.log(
          "Game: ",
          gameCode,
          "not found... \nDisconnecting Socket:",
          socket.id
        );
        socket.disconnect();
        return;
      }

      socket.join(gameCode);

      console.log(
        userType === "player" ? `Player: ${playerId}` : `Admin: ${adminId}`,
        "with SocketId:",
        socket.id,
        "joined Game:",
        gameCode
      );

      if (userType === "player") {
        io.to(gameCode).emit("player-joined", player);
      }

      // remove player
      socket.on("remove-player", async (player, gameCode) => {
        await this.prisma.player.update({
          where: { id: player.id },
          data: {
            gameId: null,
          },
        });

        console.log("Player", player.id, "removed from", gameCode);

        io.to(gameCode).emit("player-removed", player);
      });

      // start game
      socket.on("start-game", async (gameCode) => {
        await this.prisma.gameSession.update({
          where: { gameCode },
          data: {
            isPlaying: true,
          },
        });

        console.log("Game", gameCode, "started");

        io.to(gameCode).emit("game-started", gameCode);
      });

      // set timer
      socket.on("start-timer", () => {
        console.log("start timer");
        io.to(gameCode).emit("timer-starts");
      });

      // update question
      socket.on("set-question-index", async (gameCode, index) => {
        await this.prisma.gameSession.update({
          where: { gameCode },
          data: {
            currentQuestion: index,
          },
        });

        console.log("Current question index is", index, " of Game", gameCode);

        io.to(gameCode).emit("get-question-index", gameCode, index);
      });

      // show result
      socket.on("display-result", async (gameCode, quesId, options) => {
        const room = await this.prisma.gameSession.findUnique({
          where: {
            gameCode: gameCode,
          },
        });

        const playerCount = [];
        for (const opt of options) {
          const count = await this.prisma.playerAnswer.count({
            where: {
              questionId: quesId,
              optionId: opt.id,
              gameSessionId: room?.id,
            },
          });
          playerCount.push(count);
        }

        console.log("Result displaying with player counts", JSON.stringify(playerCount));
        io.to(gameCode).emit("displaying-result", playerCount);
      });

      // display leaderboard

      // next question
      socket.on("change-question", async (gameCode, index) => {
        await this.prisma.gameSession.update({
          where: { gameCode },
          data: {
            currentQuestion: index,
          },
        });

        console.log("Next question index is", index, " of Game", gameCode);

        io.to(gameCode).emit("question-changed");
      });
    });
  }

  get io() {
    return this._io;
  }
}

export default SocketService;
