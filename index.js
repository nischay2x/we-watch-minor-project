const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const { Server } = require('socket.io');
const io = new Server(3000);

app.set("view engine", "ejs");
app.set("views", __dirname + '/views');
app.use(express.static('public'));
app.use(cookieParser());
app.use(express.urlencoded({extended : true}));
app.use(express.json())

const regex = new RegExp(/^(https|http)*(:\/\/)*(www\.)*(youtube|youtu)\.(com|be)\/(watch\?v=)*/);

let rooms = {};
let socketMap = {};

io.on('connection', (socket) => {

    socket.on('join', (data) => {
        socketMap[socket.id] = data.name;
        rooms[data.room].sockets = { ...rooms[data.room].sockets, [socket.id] : data.name }
    
        socket.join(data.room)

        socket.emit('player', {video : rooms[data.room].video})
    })

    socket.on('player', (data) => {
        rooms[data.room].video.current = data.current;
        rooms[data.room].video.state = data.state;
        io.in(data.room).except(socket.id).emit('player', { video : rooms[data.room].video })
    })

    socket.on('chat', (data) => {
        const name = rooms[data.room].sockets[socket.id];
        io.in(data.room).except(socket.id).emit('chat', { name, text : data.text })
    })
})


app.get("/", (req, res) => {
    res.render("home");
})

app.post("/join", (req, res) => {
    const { jRoom, jPass, name } = req.body;
    
    if(!jRoom) return res.status(405).send("Room Id is Required");
    if(!rooms[jRoom]) return res.status(405).send("No Such Room");
    if(rooms[jRoom].password !== jPass) res.status(401).send("Wrong Password");
    
    const room = rooms[jRoom];

    res.clearCookie('room');
    res.clearCookie('name');
    res.cookie('name', name);
    res.cookie('room', jRoom);
    return res.redirect('http://localhost:5000/watch/'+jRoom);
})

app.get("/watch/:roomId", (req, res) => {
    const { roomId } = req.params;
    if(!roomId) return res.status(405).send("Room Id is Required");
    if(!rooms[roomId]) return res.status(406).send("No Such Room");

    const roomCookie = req.cookies['room'];
    if(!roomCookie || roomCookie !== roomId) return res.status(401).send("Unauthorised to Join Room");
    const room = rooms[roomId];
    res.render('watch', { 
        room : { ...room }, 
        video : room.video 
    });
})


app.post("/api/generate", async (req, res) => {
    const { videoLink, password, name, allowControl } = req.body;
    if(!videoLink || !password) return res.status(405).json({
        error : true,
        msg : "Please Provide Video Link and Password both."
    })
    const vid = videoLink.replace(regex, "").split("&")[0]
    const str = `${vid}_+_${password}`;
    const roomId = encrypt(str);

    rooms[roomId] = {
        owner : name, 
        password : password, 
        video : {
            id : vid, 
            current : 0, 
            state : 0 
        },
        allowControl : allowControl ? 1 : 0
    };


    res.clearCookie('room');
    res.clearCookie('name')
    res.cookie('name', name);
    res.cookie('room', roomId);
    // if(!regex.test(videoLink))
    return res.status(200).json({
        error : false,
        link: `http://localhost:5000/watch/${roomId}`,
    });
})

app.listen(5000, (err) => {
    if(err) console.log(err)
    else console.log("at http://localhost:5000")
})

// utilities
const skey = "secret-key";
const siv = "secret-init-vector";
const algo = "aes-256-cbc";
const key = crypto.createHash('sha512').update(skey, 'utf-8').digest('hex').substring(0, 32);
const iv = crypto.createHash('sha512').update(siv, 'utf-8').digest('hex').substring(0, 16);

function encrypt(string){
    const cipher = crypto.createCipheriv(algo, key, iv);
    let encrypted = cipher.update(string, 'utf-8', 'hex') + cipher.final('hex');
    return encrypted;
}

function decrypt(message){
    const decipher = crypto.createDecipheriv(algo, key, iv);
    const decrypted = decipher.update(message, 'hex', 'utf-8') + decipher.final('utf-8')
    return decrypted
}

