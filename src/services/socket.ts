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
      
      if (userType === "player") {

        const player = await this.prisma.player.findUnique({
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
            console.log("Game: ", gameCode, "not found... \nDisconnecting Socket:", socket.id);
            socket.disconnect();
            return;
        }

        socket.join(gameCode);
        
        console.log((userType==='player')?`Player: ${playerId}`:`Admin: ${adminId}`, "with SocketId:", socket.id, "joined Game:", gameCode);
    });
  }

  get io() {
    return this._io;
  }
}

export default SocketService;
