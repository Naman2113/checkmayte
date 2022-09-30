const path = require('path')
const http = require('http')
const express = require('express')
const socketio = require('socket.io')

var Chess = require('chess.js').Chess;

const execSync = require('child_process').execSync;

const app = express()
const server = http.createServer(app)
const io = socketio(server)

const port = process.env.PORT || 3000
const publicDirectoryPath = path.join(__dirname, '../public')

app.use(express.static(publicDirectoryPath))


// const Data = new Map()
const gameData = new Map()
const userData = new Map()
const roomsList = new Set()

let totalUsers = 0;

app.get('/credits', (req, res) => {
  res.send(' Special thanks to: <br/><br/> https://github.com/paul-schaaf <br/> https://github.com/kansalanmol0609')
})

//Getting a connection
io.on('connection', (socket) => {
    totalUsers++;
    // console.log(totalUsers)
    //To render rooms list initially
    io.emit('roomsList', Array.from(roomsList));
    io.emit('updateTotalUsers', totalUsers)
    const updateStatus = (game, room) => {
        // checkmate?
        if (game.in_checkmate()) {
            nftToken = createNFTToken(game.pgn({ max_width: 5, newline_char: '<br />' }))
            io.to(room).emit('gameOver', game.turn(), true, nftToken)
        }
        // draw? 
        else if (game.in_draw()) {
            io.to(room).emit('gameOver', game.turn(), false)
        }
        // game still on
        else {
            if (game.in_check()) {
                io.to(room).emit('inCheck', game.turn())
            }
            else {
                io.to(room).emit('updateStatus', game.turn())
            }
        }
    }

    const makeMove = (source, target, turn) => {
        var command = 'cd solchess; npm run make-move ' + turn + ' ' + source.join(' ') + ' ' + target.join(' ')
        const output = execSync(command, { encoding: 'utf-8' });  // the default is 'buffer'
        console.log('Output was:\n', output);
    }
    
    const createGame = () => {
        var command = 'cd solchess/; npm run create-game'
        const output = execSync(command, { encoding: 'utf-8' });  // the default is 'buffer'
        console.log('Output was:\n', output);
    }
    
    const joinGame = () => {
        var command = 'cd solchess/; npm run join-game'
        const output = execSync(command, { encoding: 'utf-8' });  // the default is 'buffer'
        console.log('Output was:\n', output);
    }
    
    const createNFTToken = (key) => {
        console.log("Creating NFT Token wof board with PGN Notation:")
        console.log("-----------------------------------------------")
        console.log(key)
        var command = 'OP=$(spl-token create-token --decimals 0);echo $OP'
        const output = execSync(command, { encoding: 'utf-8' });  // the default is 'buffer'
        console.log('Output was:\n', output);
        
        token = output.split(" ")[2]
        var command = 'spl-token create-account ' + token + ' ;spl-token mint ' + token +' 1;spl-token authorize ' + token + ' mint --disable'
        const output2 = execSync(command, { encoding: 'utf-8' });
        console.log('Output was:\n', output2);
        return token
    }
    
    const convertToSol = (s) => {
        var arr = []
        switch(s[0]) {
          case 'a':
            arr.push("1")
            break;
          case 'b':
            arr.push("2")
            break;
          case 'c':
            arr.push("3")
            break;
          case 'd':
            arr.push("4")
            break;
          case 'e':
            arr.push("5")
            break;
          case 'f':
            arr.push("6")
            break;
          case 'g':
            arr.push("7")
            break;
          case 'h':
            arr.push("8")
            break;
          default:
                arr.push("3")
        }
        arr.push(s[1])
        return arr
    } 

    //Creating and joining the room
    socket.on('joinRoom', ({ user, room, key }, callback) => {
        //We have to limit the number of users in a room to be just 2
        if (io.nsps['/'].adapter.rooms[room] && io.nsps['/'].adapter.rooms[room].length === 2) {
            return callback('Already 2 users are there in the room!')
        }

        var alreadyPresent = false
        for (var x in userData) {
            if (userData[x].user == user && userData[x].room == room) {
                alreadyPresent = true
            }
        }
        // console.log(userData);
        //If same name user already present
        if (alreadyPresent) {
            return callback('Choose different name!')
        }

        socket.join(room)
        //Rooms List Update
        roomsList.add(room);
        io.emit('roomsList', Array.from(roomsList));
        totalRooms = roomsList.length
        io.emit('totalRooms', totalRooms)
        userData[user + "" + socket.id] = {
            room, user,
            id: socket.id
        }

        if (io.nsps['/'].adapter.rooms[room].length === 1) {
            console.log(key)
            createGame()
        }
        //If two users are in the same room, we can start
        if (io.nsps['/'].adapter.rooms[room].length === 2) {
            joinGame()
            //Rooms List Delete
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
            var game = new Chess()
            //For getting ids of the clients
            for (var x in io.nsps['/'].adapter.rooms[room].sockets) {
                gameData[x] = game
            }
            //For giving turns one by one
            io.to(room).emit('Dragging', socket.id)
            io.to(room).emit('DisplayBoard', game.fen(), socket.id, game.pgn())
            updateStatus(game, room)
        }
    })

    //For catching dropped event
    socket.on('Dropped', ({ source, target, room }) => {
        var game = gameData[socket.id]
        var turn = game.turn()
        var move = game.move({
            from: source,
            to: target,
            promotion: 'q' // NOTE: always promote to a queen for example simplicity
        })

        var sourceSol = convertToSol(source)
        var targetSol = convertToSol(target)
        // If correct move, then toggle the turns
        if (move != null) {
            io.to(room).emit('Dragging', socket.id)
            makeMove(sourceSol, targetSol, turn)
        }
        io.to(room).emit('DisplayBoard', game.fen(), undefined, game.pgn())
        updateStatus(game, room)
        // io.to(room).emit('printing', game.fen())
    })

    //Catching message event
    socket.on('sendMessage', ({ user, room, message }) => {
        io.to(room).emit('receiveMessage', user, message)
    })

    //Disconnected
    socket.on('disconnect', () => {
        totalUsers--;
        io.emit('updateTotalUsers', totalUsers)
        var room = '', user = '';
        for (var x in userData) {
            if (userData[x].id == socket.id) {
                room = userData[x].room
                user = userData[x].user
                delete userData[x]
            }
        }
        //Rooms Removed
        if (userData[room] == null) {
            //Rooms List Delete
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
        }
        gameData.delete(socket.id)
        if (user != '' && room != '') {
            io.to(room).emit('disconnectedStatus');
        }
    })
})

server.listen(port, () => {
    console.log(`Server is up on port ${port}!`)
})