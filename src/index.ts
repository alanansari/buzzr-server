import http from 'http';
import SocketService from './services/socket';
import dotenv from 'dotenv';
dotenv.config();

async function init(){

    const socketService = new SocketService();

    const httpServer = http.createServer();
    const PORT = process.env.PORT || 3000;

    socketService.io.attach(httpServer);

    httpServer.listen(PORT, () => {
        console.log(`Server running on PORT: ${PORT}`)
    });

    socketService.initListeners();
}

init();