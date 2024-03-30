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

      if (userType === "player") {
        const playerId = socket.handshake.query.playerId as string;

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
        const adminId = socket.handshake.query.adminId as string;
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

      // handle room join
      socket.on("join room", async (roomId: string) => {

        console.log("abcd")
        
        //   check game exists or not
        const game = await this.prisma.gameSession.findUnique({
          where: {
            gameCode: roomId,
          },
        });

        if (!game) {
          console.log("Game: ", roomId, "not found");
          socket.disconnect();
          return;
        }

        // join room if game exists
        socket.join(roomId);

        console.log(`User ${socket.id} joined ${roomId}`);

        io.to(roomId).emit("user joined", socket.id);
      });

      socket.on("event:message", async ({ message }: { message: string }) => {
        console.log("New message: ", message);
      });
    });
  }

  get io() {
    return this._io;
  }
}

export default SocketService;
