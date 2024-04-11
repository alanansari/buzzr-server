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
        try {
          await this.prisma.player.update({
            where: { id: player.id },
            data: {
              gameId: null,
            },
          });
  
          console.log("Player", player.id, "removed from", gameCode);
  
          io.to(gameCode).emit("player-removed", player);
        } catch (error) {
          console.error("Error removing player:", error);
        }
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

        io.to(gameCode).emit("game-started");
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

        io.to(gameCode).emit("get-question-index", index);
      });

      // Accept Answer from Player
      socket.on(
        "submit-answer",
        async (
          gameSessionId: string,
          playerId: string,
          optionId: string,
          timeTaken: number
        ) => {
          console.log(
            "Player",
            playerId,
            "selected option",
            optionId,
            "in Game",
            gameSessionId
          );

          const option = await this.prisma.option.findUnique({
            where: {
              id: optionId,
            },
            include: {
              question: true,
            },
          });

          let score = option?.isCorrect ? 1000 : 0;

          // reduce score based on time taken and question time limit if correct answer
          if (option?.isCorrect) {
            const question = option.question;
            const timeLimit = question?.timeOut as number;

            if (timeTaken < timeLimit) {
              score -= (timeTaken / timeLimit) * 900;
            } else {
              score = 100;
            }
          }

          // Store the answer in the database
          const prevAns = await this.prisma.playerAnswer.findUnique({
            where: {
              playerId_questionId_gameSessionId: {
                playerId: playerId,
                questionId: option?.questionId as string,
                gameSessionId: gameSessionId,
              },
            },
          });

          if (!prevAns) {
            await this.prisma.playerAnswer.create({
              data: {
                playerId: playerId,
                questionId: option?.questionId as string,
                gameSessionId: gameSessionId,
                optionId: optionId,
                timeTaken: timeTaken,
                isCorrect: option?.isCorrect as boolean,
                score: score,
              },
            });
          } else {
            await this.prisma.playerAnswer.update({
              where: {
                playerId_questionId_gameSessionId: {
                  playerId: playerId,
                  questionId: option?.questionId as string,
                  gameSessionId: gameSessionId,
                },
              },
              data: {
                optionId: optionId,
                timeTaken: timeTaken,
                isCorrect: option?.isCorrect as boolean,
                score: score,
              },
            });
          }

          const prevScore = prevAns ? prevAns.score : 0;
          const newScore = score - prevScore;

          // Update player score in leaderboard
          const leaderboard = await this.prisma.gameLeaderboard.findUnique({
            where: {
              playerId_gameSessionId: {
                playerId: playerId,
                gameSessionId: gameSessionId,
              },
            },
          });

          if (leaderboard) {
            await this.prisma.gameLeaderboard.update({
              where: {
                playerId_gameSessionId: {
                  playerId: playerId,
                  gameSessionId: gameSessionId,
                },
              },
              data: {
                score: leaderboard.score + newScore,
              },
            });
          } else {
            await this.prisma.gameLeaderboard.create({
              data: {
                playerId: playerId,
                gameSessionId: gameSessionId,
                score: newScore,
              },
            });
          }
        }
      );

      // show result
      socket.on("display-result", async (gameCode, quesId, options) => {
        const room = await this.prisma.gameSession.findUnique({
          where: {
            gameCode: gameCode,
          },
        });

        // return player counts for presenter
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

        // return answer array for player
        const playerAnswers = await this.prisma.playerAnswer.findMany({
          where: {
            gameSessionId: room?.id,
            questionId: quesId,
          },
          select: {
            isCorrect: true,
            playerId: true,
          },
        });

        const data = {
          presenter: playerCount,
          player: playerAnswers,
        };

        console.log("Result displaying with data", JSON.stringify(data));
        io.to(gameCode).emit("displaying-result", data);
      });

      // display leaderboard
      socket.on("display-leaderboard", async (gameCode) => {
        const room = await this.prisma.gameSession.findUnique({
          where: {
            gameCode: gameCode,
          },
        });
        const leaderboard = await this.prisma.gameLeaderboard.findMany({
          where: {
            gameSessionId: room?.id,
          },
          include: {
            Player: true,
          },
          orderBy: {
            score: "desc",
          },
        });

        console.log("PResent leaderboard", leaderboard);

        io.to(gameCode).emit("displaying-leaderboard", leaderboard);
      });

      socket.on("final-leaderboard", async (gameCode) => {
        const room = await this.prisma.gameSession.findUnique({
          where: {
            gameCode: gameCode,
          },
        });
        const leaderboard = await this.prisma.gameLeaderboard.findMany({
          where: {
            gameSessionId: room?.id,
          },
          include: {
            Player: true,
          },
          orderBy: {
            score: "desc",
          },
        });

        const newleaderboard = leaderboard.map((entry, index) => ({
          ...entry,
          position: index + 1,
        }));

        io.to(gameCode).emit("displaying-final-leaderboard", newleaderboard);
      });

      socket.on("end-game-session", () => {
        io.to(gameCode).emit("game-session-ended");
      });
    });
  }

  get io() {
    return this._io;
  }
}

export default SocketService;
