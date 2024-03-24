import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

class SocketService {
    private _io: Server;
    private prisma: PrismaClient;
    constructor() {

        console.log('Init Socket Service...');

        this._io = new Server({
            cors: {
                allowedHeaders: ["*"],
                origin: '*'
            }
        });

        this.prisma = new PrismaClient();
    }

    public initListeners() {
        const io = this.io;
        console.log('Init Socket Listeners...');

        io.on('connection', async (socket) => {
            console.log('New connection:', socket.id);

            const playerId = socket.handshake.query.playerId as string;

            const player = await this.prisma.player.findUnique({
                where: {
                    id: playerId
                }
            });

            if (!player) {
                console.log('Player', playerId,'not found... \nDisconnecting Socket:', socket.id);
                socket.disconnect();
                return;
            }

            socket.on('event:message',async ({message}:{message:string}) => {
                console.log('New message: ', message);
            });
        });
    }

    get io() {
        return this._io;
    }
}

export default SocketService;