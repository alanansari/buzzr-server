import { Server } from "socket.io";

class SocketService {
    private _io: Server;
    constructor() {

        console.log('Init Socket Service...');

        this._io = new Server({
            cors: {
                allowedHeaders: ["*"],
                origin: '*'
            }
        });

    }

    public initListeners() {
        const io = this.io;
        console.log('Init Socket Listeners...');

        io.on('connection', (socket) => {
            console.log('New connection: ', socket.id);

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