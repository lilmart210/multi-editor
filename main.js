const ws = require('ws')

const {ChangeSet,Text} = require('@codemirror/state')
const os = require('os')
const express = require('express')
const path = require('path');

const port = 9092


const app = express();

app.use('/',express.static(path.join(__dirname,'dist')));

const itfs = os.networkInterfaces();
const keys = Object.keys(itfs)

for(const key of keys){
    const network = itfs[key]
    for(const anet of network){
        if(anet.family != 'IPv4') continue;
        console.log(`listening on http://${anet.address}:${port}`)
    }
}


let document = Text.of(['Where the problem at?','spinin like a laundromat'])
const updates = [];

const httpserver = app.listen(port);

const wss = new ws.WebSocketServer({
    server : httpserver
})

wss.on('connection',(socket,req)=>{
    socket.on("open",()=>{console.log("joined")})
    socket.on('message',(data,isbin)=>{
        const parsed = JSON.parse(Buffer.from(data).toString());
        
        const msg = parsed.msg;

        if(msg == 'GetDocument'){
            socket.send(JSON.stringify({
                msg,
                version : updates.length,
                doc : document.toString()
            }))
        }

        if(msg == 'Push'){
            //pull updates, mismatched version
            if(parsed.version != updates.length){
                socket.send(JSON.stringify({
                    msg : 'Action',
                    action : 'Pull'
                }))
            }else{
                //push updates
                const upd = [];
                //this below throws error when things are wrong
                //"Applying change set to a document with the wrong length"
                for(let update of parsed.updates){
                    let changes = ChangeSet.fromJSON(update.changes);
                    upd.push({changes,clientID : update.clientID});
                    document = changes.apply(document);
                    updates.push(update);
                }
                //updates.push(...upd)
            }
            //tell clients to update themselves
            wss.clients.forEach((client)=>{
                if(client.readyState != ws.OPEN) return;
                client.send(JSON.stringify({
                    msg : 'Action',
                    action : 'Pull'
                }))
            })
        }

        if(msg == 'Pull'){
            if(parsed.version < updates.length){
                //send missing updates
                socket.send(JSON.stringify({
                    msg : 'Pull',
                    updates : updates.slice(parsed.version)
                }))

            }else if(parsed.version > updates.length) {
                //you are in the future
                console.log("you in future")
            }
        }


    })
})

